import { runBot } from './bot-core.mjs';

// 08:00 BRT = 11:00 UTC
export const config = { schedule: '0 11 * * *' };

export default async function () {
  await runBot('manha');
  return new Response('OK');
}
