import { runBot } from './bot-core.mjs';

// 22:00 BRT = 01:00 UTC (próximo dia)
export const config = { schedule: '0 1 * * *' };

export default async function () {
  await runBot('noite');
  return new Response('OK');
}
