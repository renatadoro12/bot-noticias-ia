import { runBot } from './bot-core.mjs';

// Disparado pelo GitHub Actions às 16:00 BRT
export default async function (req) {
  const secret = process.env.TRIGGER_SECRET;
  if (secret) {
    const auth = (req?.headers?.get?.('x-trigger-secret')) || '';
    if (auth !== secret) return new Response('Unauthorized', { status: 401 });
  }
  await runBot('tarde');
  return new Response('OK');
}
