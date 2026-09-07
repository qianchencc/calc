import Calculator from './calculator';
import { getUsageData } from '../lib/usage-server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const usage = await getUsageData();
  return <Calculator usage={usage} today={new Date().toISOString().slice(0, 10)} />;
}
