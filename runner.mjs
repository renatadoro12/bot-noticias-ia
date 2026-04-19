// runner.mjs — roda o pipeline completo e salva HTML em docs/
// Chamado pelo GitHub Actions (sem Netlify Functions)
import {
  IA_FEEDS, TECH_FEEDS,
  IA_KEYWORDS, TECH_KEYWORDS,
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
console.log(`  NOTÍCIAS — rodada: ${slot.toUpperCase()} (${slug})`);
console.log(`${'─'.repeat(50)}\n`);

// Busca feeds em paralelo
console.log('Buscando feeds de IA e Tecnologia...');
const [rawIA, rawTech] = await Promise.all([
  fetchFeeds(IA_FEEDS),
  fetchFeeds(TECH_FEEDS),
]);

// Filtra por janela de tempo
const windowedIA   = filterByWindow(rawIA, slot);
const windowedTech = filterByWindow(rawTech, slot);

// Filtra por keywords
const filteredIA   = filterByKeywords(windowedIA, IA_KEYWORDS);
const filteredTech = filterByKeywords(windowedTech, TECH_KEYWORDS);

// Deduplica — URLs únicas entre as duas listas
const seenUrls = new Set();
const uniqueIA = deduplicate(filteredIA, seenUrls).slice(0, 15);
uniqueIA.forEach(a => seenUrls.add(a.url));
const uniqueTech = deduplicate(filteredTech, seenUrls).slice(0, 10);

console.log(`IA: ${uniqueIA.length} | Tech: ${uniqueTech.length} artigos únicos`);

// Resumo com Claude (em paralelo)
const [iaArticles, techArticles] = await Promise.all([
  uniqueIA.length   > 0 ? summarize(uniqueIA, apiKey)   : Promise.resolve([]),
  uniqueTech.length > 0 ? summarize(uniqueTech, apiKey) : Promise.resolve([]),
]);

// Navegação prev/next
const prevDate = new Date(today); prevDate.setUTCDate(prevDate.getUTCDate() - 1);
const nextDate = new Date(today); nextDate.setUTCDate(nextDate.getUTCDate() + 1);
const prevSlug = dateSlug(prevDate);
const nextSlug = dateSlug(nextDate);
const hasPrev = existsSync(`docs/${prevSlug}/index.html`);
const hasNext = existsSync(`docs/${nextSlug}/index.html`);

const html = generateHTML(
  iaArticles, techArticles, today,
  hasPrev ? prevSlug : null,
  hasNext ? nextSlug : null,
);

mkdirSync(`docs/${slug}`, { recursive: true });
writeFileSync(`docs/${slug}/index.html`, html, 'utf-8');
writeFileSync(
  'docs/index.html',
  `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/${slug}/"><title>Notícias</title></head><body><script>window.location.replace("/${slug}/")<\/script></body></html>`,
  'utf-8'
);

console.log(`\n✅ IA: ${iaArticles.length} | Tech: ${techArticles.length} notícias → docs/${slug}/index.html\n`);
