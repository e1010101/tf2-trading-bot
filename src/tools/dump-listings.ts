/**
 * Prints the raw backpack.tf snapshot JSON for one automatic sell and one automatic buy key
 * listing, so the client's field mapping can be checked against the real response.
 * The output is public listing data and contains no credentials.
 */
const token = process.env.BPTF_TOKEN;
if (!token) throw new Error('set BPTF_TOKEN in .env');

const url = new URL('https://backpack.tf/api/classifieds/listings/snapshot');
url.searchParams.set('appid', '440');
url.searchParams.set('sku', process.argv[2] ?? 'Mann Co. Supply Crate Key');
url.searchParams.set('token', token);

const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
const body = (await res.json()) as { listings?: Array<Record<string, unknown>> } & Record<string, unknown>;
const listings = body.listings ?? [];
const pick = (intent: string, n: number) =>
  listings.find((l) => (l.intent === intent || l.intent === n) && l.userAgent) ??
  listings.find((l) => l.intent === intent || l.intent === n);

console.log(`HTTP ${res.status}; top-level keys: ${Object.keys(body).join(', ')}; ${listings.length} listings`);
console.log('--- sell listing ---');
console.log(JSON.stringify(pick('sell', 1), null, 2));
console.log('--- buy listing ---');
console.log(JSON.stringify(pick('buy', 0), null, 2));
