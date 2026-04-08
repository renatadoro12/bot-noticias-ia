import { runBot } from './bot-core.mjs';

// 16:00 BRT = 19:00 UTC
export const config = { schedule: '0 19 * * *' };

export default async function () {
  await runBot('tarde');
  return new Response('OK');
}
