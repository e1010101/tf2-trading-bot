import SteamCommunity from 'steamcommunity';
import SteamTotp from 'steam-totp';
import TradeOfferManager from 'steam-tradeoffer-manager';
import SteamUser from 'steam-user';
import type { SteamCredentials } from '../config.ts';
import type { Holdings, Opportunity } from '../types.ts';
import type { ExecutionResult, TradeExecutor } from './executor.ts';
import { classifyPure, holdingsOf, selectPayment } from './payment.ts';
import type { PureItem } from './payment.ts';

const TF2_APPID = 440;
const TF2_CONTEXT = 2;
const { ETradeOfferState } = TradeOfferManager;

type Offer = ReturnType<TradeOfferManager['createOffer']>;
type EconItem = { assetid: string; market_hash_name: string };

interface Asset {
  appid: number;
  contextid: string;
  assetid: string;
}

function stateName(state: number): string {
  const name = Object.entries(ETradeOfferState).find(([, v]) => v === state)?.[0];
  return (name ?? `state ${state}`).toLowerCase();
}

const asset = (assetid: string): Asset => ({ appid: TF2_APPID, contextid: String(TF2_CONTEXT), assetid });

/**
 * Live executor: logs the bot account in and runs each opportunity as two Steam trade offers.
 *
 * Leg 1 pays the seller exact change from our pure and takes their listed item. Leg 2 gives
 * that item to the buyer and requests exact change from their pure. If leg 2 fails the item
 * stays in our backpack and the failure says so; nothing is dumped at a loss.
 *
 * Untested against Steam: run it with a small MAX_TRADE_COST_REF first.
 */
export class SteamExecutor implements TradeExecutor {
  readonly #creds: SteamCredentials;
  readonly #log: (msg: string) => void;
  readonly #offerTimeoutMs: number;
  readonly #client = new SteamUser();
  readonly #community = new SteamCommunity();
  readonly #manager: TradeOfferManager;
  #ready: Promise<void> | null = null;

  constructor(creds: SteamCredentials, log: (msg: string) => void, offerTimeoutMs = 120_000) {
    const missing = Object.entries(creds).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) throw new Error(`live trading needs Steam credentials; missing: ${missing.join(', ')}`);
    this.#creds = creds;
    this.#log = log;
    this.#offerTimeoutMs = offerTimeoutMs;
    this.#manager = new TradeOfferManager({
      steam: this.#client,
      community: this.#community,
      language: 'en',
      pollInterval: 5_000,
    });
  }

  #login(): Promise<void> {
    this.#ready ??= new Promise<void>((resolve, reject) => {
      this.#client.once('error', reject);
      this.#client.on('webSession', (_sessionId: string, cookies: string[]) => {
        this.#community.setCookies(cookies);
        this.#manager.setCookies(cookies, (err) => {
          if (err) return reject(err);
          this.#log('steam: logged in, web session ready');
          resolve();
        });
      });
      this.#client.logOn({
        accountName: this.#creds.accountName,
        password: this.#creds.password,
        twoFactorCode: SteamTotp.generateAuthCode(this.#creds.sharedSecret),
      });
    }).catch((err: unknown) => {
      this.#ready = null;
      throw err;
    });
    return this.#ready;
  }

  /** Tradable pure items in our inventory, or another user's when `steamId` is given. */
  async #pure(steamId?: string): Promise<PureItem[]> {
    await this.#login();
    const items = await new Promise<EconItem[]>((resolve, reject) => {
      const cb = (err: Error | null, inv: EconItem[]) => (err ? reject(err) : resolve(inv));
      if (steamId) this.#manager.getUserInventoryContents(steamId, TF2_APPID, TF2_CONTEXT, true, cb as never);
      else this.#manager.getInventoryContents(TF2_APPID, TF2_CONTEXT, true, cb as never);
    });
    const out: PureItem[] = [];
    for (const i of items) {
      const kind = classifyPure(i.market_hash_name);
      if (kind) out.push({ assetid: i.assetid, kind });
    }
    return out;
  }

  async getHoldings(): Promise<Holdings> {
    return holdingsOf(await this.#pure());
  }

  async execute(opp: Opportunity): Promise<ExecutionResult> {
    const { buyFrom, sellTo } = opp;
    if (!buyFrom.itemId) return { ok: false, reason: 'seller listing has no item ID' };
    if (!buyFrom.tradeOfferUrl) return { ok: false, reason: 'seller listing has no trade offer URL' };
    if (!sellTo.tradeOfferUrl) return { ok: false, reason: 'buyer listing has no trade offer URL' };

    // Leg 1: pay the seller, receive the item.
    const pay = selectPayment(await this.#pure(), buyFrom.price);
    if (!pay) return { ok: false, reason: 'no exact change for leg 1' };

    const leg1 = this.#manager.createOffer(buyFrom.tradeOfferUrl);
    leg1.addMyItems(pay.map(asset) as never);
    leg1.addTheirItem(asset(buyFrom.itemId) as never);
    const state1 = await this.#sendAndWait(leg1, `leg 1 to ${buyFrom.steamId}`);
    if (state1 !== 'accepted') return { ok: false, reason: `leg 1 ${state1}; nothing traded` };

    const received = await new Promise<EconItem[]>((resolve, reject) =>
      leg1.getReceivedItems((err, items) => (err ? reject(err) : resolve(items as unknown as EconItem[]))),
    );
    const item = received[0];
    if (!item) return { ok: false, reason: 'leg 1 accepted but received item not found; check inventory' };

    // Leg 2: give the item to the buyer, receive their pure.
    const theirPay = selectPayment(await this.#pure(sellTo.steamId), sellTo.price);
    if (!theirPay) {
      return { ok: false, reason: `buyer cannot pay exact change; item ${item.assetid} held in backpack` };
    }
    const leg2 = this.#manager.createOffer(sellTo.tradeOfferUrl);
    leg2.addMyItem(asset(item.assetid) as never);
    leg2.addTheirItems(theirPay.map(asset) as never);
    const state2 = await this.#sendAndWait(leg2, `leg 2 to ${sellTo.steamId}`);
    if (state2 !== 'accepted') {
      return { ok: false, reason: `leg 2 ${state2}; item ${item.assetid} held in backpack` };
    }
    return { ok: true };
  }

  /** Send, confirm with the identity secret, and wait for the partner to act. Cancels on timeout. */
  async #sendAndWait(offer: Offer, label: string): Promise<'accepted' | 'timeout' | string> {
    offer.setMessage('Thanks for trading!');
    const status = await new Promise<string>((resolve, reject) =>
      offer.send((err, s) => (err ? reject(err) : resolve(s))),
    );
    if (status === 'pending') {
      await new Promise<void>((resolve, reject) =>
        this.#community.acceptConfirmationForObject(this.#creds.identitySecret, offer.id, (err: Error | null) =>
          err ? reject(err) : resolve(),
        ),
      );
    }
    this.#log(`steam: sent ${label} (offer ${offer.id})`);

    return new Promise((resolve) => {
      const done = (result: string) => {
        clearTimeout(timer);
        this.#manager.removeListener('sentOfferChanged', onChange);
        resolve(result);
      };
      const onChange = (changed: Offer) => {
        if (changed.id !== offer.id) return;
        if (changed.state === ETradeOfferState.Accepted) done('accepted');
        else if (changed.state !== ETradeOfferState.Active && changed.state !== ETradeOfferState.CreatedNeedsConfirmation) {
          done(stateName(changed.state));
        }
      };
      const timer = setTimeout(() => {
        offer.cancel(() => {});
        done('timeout');
      }, this.#offerTimeoutMs);
      this.#manager.on('sentOfferChanged', onChange);
    });
  }
}
