import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import Parser from 'rss-parser';

// ─── CONFIG — IA ────────────────────────────────────────────────────────────

export const IA_FEEDS = [
  'https://techcrunch.com/category/artificial-intelligence/feed/',
  'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
  'https://venturebeat.com/category/ai/feed/',
  'https://www.technologyreview.com/feed/',
  'https://www.zdnet.com/topic/artificial-intelligence/rss.xml',
  'https://arstechnica.com/ai/feed/',
  'https://rss.arxiv.org/rss/cs.AI',
  'https://openai.com/blog/rss.xml',
  'https://www.deepmind.com/blog/rss.xml',
  'https://blogs.microsoft.com/ai/feed/',
  'https://huggingface.co/blog/feed.xml',
  'https://fortune.com/feed/fortune-feeds/?id=3230629',
  'https://feeds.bloomberg.com/technology/news.rss',
  'https://www.canaltech.com.br/rss/inteligencia-artificial/',
  'https://www.startups.com.br/tag/inteligencia-artificial/feed/',
  'https://mittechreview.com.br/feed/',
  'https://aiweekly.co/issues.rss',
  'https://www.marktechpost.com/feed/',
];

export const IA_KEYWORDS = [
  'artificial intelligence','machine learning','deep learning','LLM','GPT',
  'Claude','Gemini','Llama','Mistral','neural network','computer vision',
  'NLP','generative AI','diffusion model','transformer','inteligência artificial',
  'aprendizado de máquina','IA generativa','chatbot','automação inteligente',
  'large language model','foundation model','fine-tuning','AI model','AI tool',
  'OpenAI','Anthropic','Google DeepMind','Stability AI','Midjourney',
  'Perplexity','Grok','xAI','Cursor','Copilot','Sora','Runway',
  'ElevenLabs','Cohere','DeepSeek','Qwen','Gemma','GPT-4','GPT-5','o3','o4',
];

// ─── CONFIG — TECNOLOGIA ────────────────────────────────────────────────────

export const TECH_FEEDS = [
  // Internacional — tech geral
  'https://techcrunch.com/feed/',
  'https://www.theverge.com/rss/index.xml',
  'https://www.engadget.com/rss.xml',
  'https://feeds.arstechnica.com/arstechnica/index',
  'https://gizmodo.com/rss',
  'https://www.cnet.com/rss/news/',
  'https://www.wired.com/feed/rss',
  'https://www.theguardian.com/technology/rss',
  // Ciência e curiosidades
  'https://interestingengineering.com/feed',
  'https://www.newscientist.com/feed/home',
  'https://futurism.com/feed',
  'https://www.sciencealert.com/feed',
  'https://singularityhub.com/feed',
  'https://what-if.xkcd.com/feed.atom',
  // Comunidade tech (Reddit RSS nativo)
  'https://www.reddit.com/r/Futurology/.rss',
  'https://www.reddit.com/r/technology/.rss',
  'https://www.reddit.com/r/interestingasfuck/.rss',
  // Hacker News
  'https://news.ycombinator.com/rss',
  // Português — Brasil e Internacional
  'https://tecnoblog.net/feed/',
  'https://www.tecmundo.com.br/feed',
  'https://olhardigital.com.br/feed/',
  'https://www.techtudo.com.br/rss2.xml',
  'https://www.canaltech.com.br/rss/',
  'https://rss.dw.com/rdf/rss-pt-br-all',
];

export const TECH_KEYWORDS = [
  'smartphone','gadget','app','software','hardware','startup','chip',
  'processador','celular','iphone','android','apple','google','microsoft',
  'samsung','metaverso','realidade virtual','realidade aumentada','wearable',
  'drone','robô','robótica','quantum','computação quântica','cibersegurança',
  'hacker','privacidade','dados','cloud','nuvem','5g','internet das coisas',
  'iot','biotecnologia','espaço','satélite','elétrico','tesla','spacex',
  'tecnologia','inovação','ciência','descoberta','invenção','futuro',
  'tech','device','battery','electric','rocket','biology','physics','space',
];

const SLOT_WINDOWS = {
  manha: { startH: 22, endH: 8,  prevDay: true  },
  tarde: { startH: 8,  endH: 16, prevDay: false },
  noite: { startH: 16, endH: 22, prevDay: false },
};

// ─── HELPERS ───────────────────────────────────────────────────────────────

function nowBR() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}

function dateSlug(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function escapeHTML(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── RSS FETCH ─────────────────────────────────────────────────────────────

export async function fetchFeeds(feedList) {
  const parser = new Parser({ timeout: 10000 });

  const results = await Promise.allSettled(
    feedList.map(url =>
      parser.parseURL(url).then(feed => ({ url, feed }))
    )
  );

  const articles = [];
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn(`Feed falhou: ${result.reason?.message || result.reason}`);
      continue;
    }
    const { url, feed } = result.value;
    const source = feed.title || new URL(url).hostname;
    for (const item of (feed.items || [])) {
      if (!item.link || !item.title) continue;
      if (!item.pubDate) continue;
      const published = new Date(item.pubDate);
      if (isNaN(published.getTime())) continue;
      articles.push({
        url: item.link.trim(),
        title: item.title.trim(),
        source,
        published,
        summary: '',
      });
    }
  }

  console.log(`Total coletado: ${articles.length} artigos de ${feedList.length} fontes`);
  return articles;
}

// ─── FILTERS ───────────────────────────────────────────────────────────────

export function filterByWindow(articles, slot) {
  const w = SLOT_WINDOWS[slot];
  const now = new Date();

  const endH_utc = (w.endH + 3) % 24;
  const end = new Date(now);
  if (w.endH + 3 >= 24) end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCHours(endH_utc, 0, 0, 0);

  const startH_utc = (w.startH + 3) % 24;
  const start = new Date(now);
  if (w.prevDay) start.setUTCDate(start.getUTCDate() - 1);
  if (w.startH + 3 >= 24) start.setUTCDate(start.getUTCDate() + 1);
  start.setUTCHours(startH_utc, 0, 0, 0);

  const filtered = articles.filter(a => a.published >= start && a.published <= end);
  console.log(`Após filtro de data [${slot}]: ${filtered.length}/${articles.length}`);
  return filtered;
}

export function filterByKeywords(articles, keywords) {
  const filtered = articles.filter(a => {
    const text = (a.title + ' ' + (a.summary || '')).toLowerCase();
    return keywords.some(kw => text.includes(kw.toLowerCase()));
  });
  console.log(`Após filtro de keywords: ${filtered.length}`);
  return filtered;
}

export function deduplicate(articles, existingUrls = new Set()) {
  const seen = new Set(existingUrls);
  return articles.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });
}

// ─── CLAUDE SUMMARIZE ──────────────────────────────────────────────────────

export async function summarize(articles, apiKey) {
  const client = new Anthropic({ apiKey });
  const results = [];

  for (const article of articles) {
    try {
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Resuma em 2-3 frases em português (pt-BR), de forma direta e informativa:\n\nTítulo: ${article.title}\nFonte: ${article.source}\n\nSem introdução. Vá direto ao ponto.`,
        }],
      });
      results.push({ ...article, summary: msg.content[0].text.trim() });
    } catch (e) {
      console.warn(`Erro ao resumir: ${article.title} — ${e.message}`);
      results.push({ ...article, summary: '' });
    }
  }

  console.log(`Claude resumiu ${results.length} artigos`);
  return results;
}

// ─── HTML GENERATION ───────────────────────────────────────────────────────

const MONTHS_PT = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro',
];

function articleCard(a) {
  const brtH = a.published ? ((a.published.getUTCHours() - 3 + 24) % 24) : null;
  const h   = brtH !== null ? String(brtH).padStart(2, '0') : '--';
  const min = a.published  ? String(a.published.getUTCMinutes()).padStart(2, '0') : '--';
  return `
    <div class="article" data-searchable="${escapeHTML(a.title)} ${escapeHTML(a.summary)} ${escapeHTML(a.source)}">
      <div class="article-meta">
        <span class="article-time">${h}:${min}</span>
        <span class="article-source">${escapeHTML(a.source)}</span>
      </div>
      <div class="article-title">${escapeHTML(a.title)}</div>
      <div class="article-summary">${escapeHTML(a.summary)}</div>
      <a class="article-link" href="${escapeHTML(a.url)}" target="_blank" rel="noopener">Ler matéria original →</a>
    </div>`;
}

export function generateHTML(iaArticles, techArticles, today, prevSlug, nextSlug) {
  const date_pt = `${today.getUTCDate()} de ${MONTHS_PT[today.getUTCMonth()]} de ${today.getUTCFullYear()}`.toUpperCase();
  const date_compact = `${String(today.getUTCDate()).padStart(2,'0')} ${MONTHS_PT[today.getUTCMonth()].slice(0,3)} ${today.getUTCFullYear()}`;

  const prevBtn = prevSlug
    ? `<a class="page-btn" href="../${prevSlug}/">← Anterior</a>`
    : `<span class="page-btn disabled">← Anterior</span>`;
  const nextBtn = nextSlug
    ? `<a class="page-btn" href="../${nextSlug}/">Próximo →</a>`
    : `<span class="page-btn disabled">Próximo →</span>`;
  const hojeBtn = `<a id="btnHoje" class="page-btn" style="display:none;" href="#">Hoje</a>`;

  const iaHTML = iaArticles.length > 0
    ? iaArticles.map(articleCard).join('\n')
    : '<div class="empty-slot">Ainda sem notícias de IA hoje</div>';

  const techHTML = techArticles.length > 0
    ? techArticles.map(articleCard).join('\n')
    : '<div class="empty-slot">Ainda sem notícias de tecnologia hoje</div>';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Notícias — Professora Crypto</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #080810; color: #ddd; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; min-height: 100vh; }
  .hero { padding: 52px 24px 36px; text-align: center; border-bottom: 1px solid #111; }
  .hero-label { font-size: 11px; letter-spacing: 6px; color: #333; text-transform: uppercase; margin-bottom: 16px; }
  .hero-title { font-size: 48px; font-weight: 900; background: linear-gradient(135deg, #7c3aed, #2563eb); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: -2px; line-height: 1; }
  .hero-sub { font-size: 13px; color: #2a2a2a; margin-top: 10px; letter-spacing: 1px; }
  .hero-date { font-size: 12px; color: #333; margin-top: 18px; letter-spacing: 4px; text-transform: uppercase; }
  .pagination { display: flex; justify-content: center; align-items: center; gap: 16px; padding: 14px 24px; border-bottom: 1px solid #0f0f0f; }
  .page-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; letter-spacing: 1px; text-decoration: none; border: 1px solid #1a1a1a; color: #444; transition: .2s; text-transform: uppercase; }
  .page-btn:hover { border-color: #444; color: #aaa; }
  .page-btn.disabled { opacity: 0.2; pointer-events: none; }
  .page-current { font-size: 12px; color: #2a2a2a; letter-spacing: 2px; }
  /* TABS */
  .tabs-nav { display: flex; justify-content: center; align-items: center; gap: 6px; padding: 14px 24px; border-bottom: 1px solid #0f0f0f; background: #080810; position: sticky; top: 0; z-index: 100; }
  .tab-btn { padding: 6px 20px; border-radius: 100px; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; border: 1px solid #1a1a1a; background: transparent; color: #444; cursor: pointer; transition: .15s; }
  .tab-btn:hover { border-color: #444; color: #aaa; }
  .tab-btn.active-ia { background: #1a0a3a; border-color: #5b21b6; color: #a78bfa; }
  .tab-btn.active-tech { background: #0a1f3a; border-color: #1d4ed8; color: #60a5fa; }
  .tab-search { margin-left: auto; padding: 6px 14px; border-radius: 100px; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; border: 1px solid #1a1a1a; background: transparent; color: #444; cursor: pointer; transition: .15s; }
  .tab-search:hover { border-color: #444; color: #aaa; }
  /* SEARCH */
  .search-bar { display: none; padding: 12px 24px; background: #0d0d0d; border-bottom: 1px solid #111; }
  .search-bar.open { display: block; }
  .search-input { width: 100%; max-width: 600px; display: block; margin: 0 auto; background: #111; border: 1px solid #1e1e1e; color: #ddd; padding: 10px 16px; border-radius: 8px; font-size: 14px; font-family: inherit; outline: none; }
  .search-input:focus { border-color: #444; }
  .search-input::placeholder { color: #333; }
  /* PANELS */
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }
  .slot-section { max-width: 760px; margin: 0 auto; padding: 48px 24px; border-bottom: 1px solid #0d0d0d; }
  .slot-header { display: flex; align-items: center; gap: 12px; margin-bottom: 36px; padding-bottom: 18px; border-bottom: 1px solid #111; }
  .slot-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .slot-dot.ia { background: #7c3aed; }
  .slot-dot.tech { background: #2563eb; }
  .slot-label { font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; }
  .slot-label.ia { color: #a78bfa; }
  .slot-label.tech { color: #60a5fa; }
  .slot-count { font-size: 11px; color: #222; margin-left: auto; letter-spacing: 1px; }
  /* ARTICLES */
  .article { padding: 28px 0; border-bottom: 1px solid #0f0f0f; }
  .article:last-child { border-bottom: none; padding-bottom: 0; }
  .article.hidden { display: none; }
  .article-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .article-time { font-size: 11px; color: #444; font-weight: 700; background: #111; padding: 3px 8px; border-radius: 4px; font-variant-numeric: tabular-nums; }
  .article-source { font-size: 11px; color: #2e2e2e; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; }
  .article-title { font-size: 20px; font-weight: 700; color: #eee; line-height: 1.4; margin-bottom: 14px; }
  .article-summary { font-size: 14px; color: #555; line-height: 1.9; margin-bottom: 14px; }
  .article-link { font-size: 11px; color: #2a2a6a; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; text-decoration: none; transition: color .15s; }
  .article-link:hover { color: #5555cc; }
  .empty-slot { color: #222; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; text-align: center; padding: 20px 0; }
  .search-empty { display: none; text-align: center; padding: 60px 24px; color: #333; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; }
  .footer { text-align: center; padding: 56px 24px; color: #1a1a1a; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; border-top: 1px solid #0d0d0d; }
  .fab-group { position: fixed; bottom: 28px; right: 24px; display: flex; flex-direction: column; gap: 10px; z-index: 200; }
  .fab { width: 44px; height: 44px; border-radius: 50%; border: 1px solid #1a1a1a; background: #0f0f0f; color: #444; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: .2s; }
  .fab:hover { border-color: #444; color: #ccc; }
  @media (max-width: 600px) { .hero-title { font-size: 34px; } .slot-section { padding: 32px 16px; } .article-title { font-size: 17px; } .tabs-nav { gap: 4px; padding: 12px 16px; } .tab-btn { padding: 6px 12px; font-size: 10px; } }
</style>
</head>
<body>
<div class="hero">
  <div class="hero-label">Inteligência Artificial &amp; Tecnologia</div>
  <div class="hero-title">NOTÍCIAS</div>
  <div class="hero-sub">Professora Crypto</div>
  <div class="hero-date">${date_pt}</div>
</div>
<div class="pagination">
  ${prevBtn}
  <span class="page-current">${date_compact}</span>
  ${nextBtn}
  ${hojeBtn}
</div>
<div class="tabs-nav">
  <button class="tab-btn active-ia" id="tab-ia" onclick="switchTab('ia')">🤖 Inteligência Artificial</button>
  <button class="tab-btn" id="tab-tech" onclick="switchTab('tech')">💡 Tecnologia</button>
  <button class="tab-search" onclick="toggleSearch()">🔍</button>
</div>
<div class="search-bar" id="searchBar">
  <input class="search-input" id="searchInput" type="text" placeholder="Buscar notícias..." oninput="filterNews(this.value)">
</div>
<!-- ABA IA -->
<div class="tab-panel active" id="panel-ia">
  <div class="slot-section">
    <div class="slot-header">
      <span class="slot-dot ia"></span>
      <span class="slot-label ia">Inteligência Artificial</span>
      <span class="slot-count">${iaArticles.length} notícias</span>
    </div>
    ${iaHTML}
  </div>
</div>
<!-- ABA TECH -->
<div class="tab-panel" id="panel-tech">
  <div class="slot-section">
    <div class="slot-header">
      <span class="slot-dot tech"></span>
      <span class="slot-label tech">Tecnologia</span>
      <span class="slot-count">${techArticles.length} notícias</span>
    </div>
    ${techHTML}
  </div>
</div>
<div class="search-empty" id="searchEmpty">Nenhuma notícia encontrada</div>
<div class="footer">Notícias &nbsp;·&nbsp; Professora Crypto</div>
<div class="fab-group">
  <button class="fab" onclick="window.scrollBy({top: window.innerHeight * 0.85, behavior:'smooth'})" title="↓">↓</button>
</div>
<script>
  let currentTab = 'ia';
  (function() {
    function todayBRT() {
      const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
      return d.getUTCFullYear() + '-' +
        String(d.getUTCMonth() + 1).padStart(2,'0') + '-' +
        String(d.getUTCDate()).padStart(2,'0');
    }
    const today = todayBRT();
    const parts = window.location.pathname.split('/').filter(Boolean);
    const current = parts[parts.length - 1] || '';
    const btn = document.getElementById('btnHoje');
    if (btn && current !== today) { btn.href = '/' + today + '/'; btn.style.display = 'inline-flex'; }
  })();
  function switchTab(tab) {
    currentTab = tab;
    document.getElementById('panel-ia').classList.toggle('active', tab === 'ia');
    document.getElementById('panel-tech').classList.toggle('active', tab === 'tech');
    document.getElementById('tab-ia').className = 'tab-btn' + (tab === 'ia' ? ' active-ia' : '');
    document.getElementById('tab-tech').className = 'tab-btn' + (tab === 'tech' ? ' active-tech' : '');
    const input = document.getElementById('searchInput');
    if (input.value) { input.value = ''; filterNews(''); }
  }
  function toggleSearch() {
    const bar = document.getElementById('searchBar');
    const open = bar.classList.toggle('open');
    if (open) document.getElementById('searchInput').focus();
    else { filterNews(''); document.getElementById('searchInput').value = ''; }
  }
  function filterNews(q) {
    const term = q.toLowerCase().trim();
    const panel = document.getElementById('panel-' + currentTab);
    const items = panel.querySelectorAll('.article');
    let any = false;
    items.forEach(item => {
      const match = !term || (item.dataset.searchable || '').toLowerCase().includes(term);
      item.classList.toggle('hidden', !match);
      if (match) any = true;
    });
    document.getElementById('searchEmpty').style.display = (term && !any) ? 'block' : 'none';
  }
</script>
</body>
</html>`;
}

// ─── NETLIFY DEPLOY ────────────────────────────────────────────────────────

export async function deployToNetlify(slug, htmlContent, token, siteId) {
  const authHeaders = { Authorization: `Bearer ${token}` };

  let existingHashes = {};
  try {
    const siteResp = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, { headers: authHeaders });
    const site = await siteResp.json();
    const deployId = site.published_deploy?.id;
    if (deployId) {
      const deployResp = await fetch(`https://api.netlify.com/api/v1/deploys/${deployId}`, { headers: authHeaders });
      const deploy = await deployResp.json();
      existingHashes = deploy.files || {};
      console.log(`Arquivos existentes no deploy: ${Object.keys(existingHashes).length}`);
    }
  } catch (e) {
    console.warn('Não foi possível buscar deploy existente:', e.message);
  }

  const htmlBuf = Buffer.from(htmlContent, 'utf-8');
  const redirectBuf = Buffer.from(
    `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/${slug}/"><title>Notícias</title></head><body><script>window.location.replace("/${slug}/")<\/script></body></html>`,
    'utf-8'
  );

  const newFiles = {
    [`/${slug}/index.html`]: htmlBuf,
    '/index.html': redirectBuf,
  };

  const allHashes = { ...existingHashes };
  for (const [path, buf] of Object.entries(newFiles)) {
    allHashes[path] = sha1(buf);
  }

  const deployResp = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: allHashes }),
  });
  if (!deployResp.ok) {
    throw new Error(`Netlify deploy error ${deployResp.status}: ${await deployResp.text()}`);
  }
  const deployData = await deployResp.json();
  const deployId = deployData.id;
  const required = new Set(deployData.required || []);
  console.log(`Deploy criado: ${deployId} — uploads necessários: ${required.size}`);

  for (const [path, buf] of Object.entries(newFiles)) {
    const hash = sha1(buf);
    if (!required.has(hash)) continue;
    const upResp = await fetch(
      `https://api.netlify.com/api/v1/deploys/${deployId}/files${path}`,
      { method: 'PUT', headers: { ...authHeaders, 'Content-Type': 'application/octet-stream' }, body: buf }
    );
    if (!upResp.ok) {
      throw new Error(`Upload error ${upResp.status} for ${path}: ${await upResp.text()}`);
    }
    console.log(`Uploaded: ${path}`);
  }

  const url = `https://${siteId}.netlify.app/${slug}/`;
  console.log(`Deploy concluído: ${url}`);
  return url;
}

// ─── PIPELINE PRINCIPAL ────────────────────────────────────────────────────

export async function runBot(slot) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const token = process.env.NETLIFY_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;

  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não definida');
  if (!token)  throw new Error('NETLIFY_TOKEN não definida');
  if (!siteId) throw new Error('NETLIFY_SITE_ID não definida');

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  NOTÍCIAS — rodada: ${slot.toUpperCase()}`);
  console.log(`${'─'.repeat(50)}\n`);

  const today = nowBR();
  const slug = dateSlug(today);

  // Busca feeds em paralelo
  console.log('Buscando feeds de IA...');
  const [rawIA, rawTech] = await Promise.all([
    fetchFeeds(IA_FEEDS),
    fetchFeeds(TECH_FEEDS),
  ]);

  // Filtra por janela de tempo
  const windowedIA = filterByWindow(rawIA, slot);
  const windowedTech = filterByWindow(rawTech, slot);

  // Filtra por keywords
  const filteredIA = filterByKeywords(windowedIA, IA_KEYWORDS);
  const filteredTech = filterByKeywords(windowedTech, TECH_KEYWORDS);

  // Deduplica (URLs únicas entre as duas listas)
  const seenUrls = new Set();
  const uniqueIA = deduplicate(filteredIA, seenUrls).slice(0, 15);
  uniqueIA.forEach(a => seenUrls.add(a.url));
  const uniqueTech = deduplicate(filteredTech, seenUrls).slice(0, 10);

  console.log(`IA: ${uniqueIA.length} artigos únicos | Tech: ${uniqueTech.length} artigos únicos`);

  // Resumo com Claude (em paralelo)
  const [iaArticles, techArticles] = await Promise.all([
    uniqueIA.length > 0 ? summarize(uniqueIA, apiKey) : Promise.resolve([]),
    uniqueTech.length > 0 ? summarize(uniqueTech, apiKey) : Promise.resolve([]),
  ]);

  // Navegação prev/next
  const prevDate = new Date(today); prevDate.setUTCDate(prevDate.getUTCDate() - 1);
  const nextDate = new Date(today); nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const prevSlug = dateSlug(prevDate);
  const nextSlug = dateSlug(nextDate);

  let prevExists = false, nextExists = false;
  try {
    const authHeaders = { Authorization: `Bearer ${token}` };
    const siteResp = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, { headers: authHeaders });
    const site = await siteResp.json();
    const deployId = site.published_deploy?.id;
    if (deployId) {
      const deployResp = await fetch(`https://api.netlify.com/api/v1/deploys/${deployId}`, { headers: authHeaders });
      const deploy = await deployResp.json();
      const files = deploy.files || {};
      prevExists = (`/${prevSlug}/index.html` in files);
      nextExists = (`/${nextSlug}/index.html` in files);
    }
  } catch {}

  const html = generateHTML(
    iaArticles, techArticles, today,
    prevExists ? prevSlug : null,
    nextExists ? nextSlug : null,
  );
  const url = await deployToNetlify(slug, html, token, siteId);

  console.log(`\n✅ IA: ${iaArticles.length} | Tech: ${techArticles.length} notícias publicadas!`);
  console.log(`🔗 ${url}\n`);

  return url;
}
