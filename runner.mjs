// runner.mjs — roda o pipeline completo e salva HTML em public/
// Chamado pelo GitHub Actions (sem Netlify Functions)
import {
  fetchFeeds,
  filterByWindow,
  filterByKeywords,
  deduplicate,
  summarize,
  generateHTML,
} from './netlify/functions/bot-core.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const slot = process.argv[2];
if (!['manha', 'tarde', 'noite'].includes(slot)) {
  console.error('Uso: node runner.mjs [manha|tarde|noite]');
  process.exit(1);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY não definida'); process.exit(1); }

function nowBR() { return new Date(Date.now() - 3 * 60 * 60 * 1000); }
function dateSlug(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

const today = nowBR();
const slug = dateSlug(today);

console.log(`\n${'─'.repeat(50)}`);
console.log(`  NOTÍCIAS IA — rodada: ${slot.toUpperCase()} (${slug})`);
console.log(`${'─'.repeat(50)}\n`);

const raw = await fetchFeeds();
const windowed = filterByWindow(raw, slot);
const filtered = filterByKeywords(windowed);
const unique = deduplicate(filtered).slice(0, 15);
const articles = unique.length > 0 ? await summarize(unique, apiKey) : [];

const prevDate = new Date(today); prevDate.setUTCDate(prevDate.getUTCDate() - 1);
const nextDate = new Date(today); nextDate.setUTCDate(nextDate.getUTCDate() + 1);
const prevSlug = dateSlug(prevDate);
const nextSlug = dateSlug(nextDate);
const hasPrev = existsSync(`public/${prevSlug}/index.html`);
const hasNext = existsSync(`public/${nextSlug}/index.html`);

const html = generateHTML(
  articles, today,
  hasPrev ? prevSlug : null,
  hasNext ? nextSlug : null
);

mkdirSync(`public/${slug}`, { recursive: true });
writeFileSync(`public/${slug}/index.html`, html, 'utf-8');
writeFileSync(
  'public/index.html',
  `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/${slug}/"><title>Notícias IA</title></head><body><script>window.location.replace("/${slug}/")<\/script></body></html>`,
  'utf-8'
);

console.log(`\n✅ ${articles.length} notícias geradas → public/${slug}/index.html\n`);
