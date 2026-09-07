import Calculator from './calculator';
import { getUsageData } from '../lib/usage-server';
import { shanghaiDate } from '../lib/usage';

export const revalidate = 3600;

export default async function Home() {
  const usage = await getUsageData();
  return <Calculator usage={usage} today={shanghaiDate()} />;
}
