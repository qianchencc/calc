import { unstable_cache } from 'next/cache';
import { parseUsageSnapshot } from './usage';

const readSnapshot = unstable_cache(async () => {
  const key = process.env.CALC_USAGE_KEY;
  if (!key) throw new Error('CALC_USAGE_KEY not configured');
  const response = await fetch('https://proxy.qianc.ltd/api/calc/usage', {
    headers: { Authorization: `Bearer ${key}` }, cache: 'no-store',
    signal: AbortSignal.timeout(8000), redirect: 'error',
  });
  if (!response.ok) throw new Error(`Usage source HTTP ${response.status}`);
  return parseUsageSnapshot(await response.json());
}, ['tier-usage-v1'], { revalidate: 3600 });

export async function getUsageData() {
  try { return await readSnapshot(); }
  catch { console.error('Usage snapshot unavailable'); return null; }
}
