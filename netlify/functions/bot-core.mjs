import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import Parser from 'rss-parser';

// ─── CONFIG ────────────────────────────────────────────────────────────────

const FEEDS = [
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

const KEYWORDS = [
  'artificial intelligence','machine learning','deep learning','LLM','GPT',
  'Claude','Gemini','Llama','Mistral','neural network','computer vision',
  'NLP','generative AI','diffusion model','transformer','inteligência artificial',
  'aprendizado de máquina','IA generativa','chatbot','automação inteligente',
  'large language model','foundation model','fine-tuning','AI model','AI tool',
  'OpenAI','Anthropic','Google DeepMind','Stability AI','Midjourney',
  'Perplexity','Grok','xAI','Cursor','Copilot','Sora','Runway',
  'ElevenLabs','Cohere','DeepSeek','Qwen','Gemma','GPT-4','GPT-5','o3','o4',
];

const SLOT_WINDOWS = {
  manha: { startH: 22, endH: 8,  prevDay: true  },
  tarde: { startH: 8,  endH: 16, prevDay: false },
  noite: { startH: 16, endH: 22, prevDay: false },
};

// ─── HELPERS ───────────────────────────────────────────────────────────────

function nowBR() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function dateSlug(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function escapeHTML(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── RSS FETCH ─────────────────────────────────────────────────────────────

export async function fetchFeeds() {
  const parser = new Parser({ timeout: 15000 });
  const articles = [];

  for (const url of FEEDS) {
    try {
      const feed = await parser.parseURL(url);
      const source = feed.title || new URL(url).hostname;
      for (const item of (feed.items || [])) {
        if (!item.link || !item.title) continue;
        articles.push({
          url: item.link.trim(),
          title: item.title.trim(),
          source,
          published: item.pubDate ? new Date(item.pubDate) : new Date(),
          summary: '',
        });
      }
    } catch (e) {
      console.warn(`Feed falhou: ${url} — ${e.message}`);
    }
  }

  console.log(`Total coletado: ${articles.length} artigos de ${FEEDS.length} fontes`);
  return articles;
}

// ─── FILTERS ───────────────────────────────────────────────────────────────

export function filterByWindow(articles, slot) {
  const w = SLOT_WINDOWS[slot];
  const now = nowBR();

  const end = new Date(now);
  end.setHours(w.endH, 0, 0, 0);

  const start = new Date(now);
  if (w.prevDay) start.setDate(start.getDate() - 1);
  start.setHours(w.startH, 0, 0, 0);

  const filtered = articles.filter(a => a.published >= start && a.published <= end);
  console.log(`Após filtro de data [${slot}]: ${filtered.length}/${articles.length}`);
  return filtered;
}

export function filterByKeywords(articles) {
  const filtered = articles.filter(a => {
    const text = (a.title + ' ' + (a.summary || '')).toLowerCase();
    return KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
  });
  console.log(`Após filtro de keywords: ${filtered.length}`);
  return filtered;
}

export function deduplicate(articles) {
  const seen = new Set();
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

export function generateHTML(articles, today, prevSlug, nextSlug) {
  const date_pt = `${today.getDate()} de ${MONTHS_PT[today.getMonth()]} de ${today.getFullYear()}`.toUpperCase();
  const date_compact = `${String(today.getDate()).padStart(2,'0')} ${MONTHS_PT[today.getMonth()].slice(0,3)} ${today.getFullYear()}`;

  const prevBtn = prevSlug
    ? `<a class="page-btn" href="../${prevSlug}/">← Anterior</a>`
    : `<span class="page-btn disabled">← Anterior</span>`;
  const nextBtn = nextSlug
    ? `<a class="page-btn" href="../${nextSlug}/">Próximo →</a>`
    : `<span class="page-btn disabled">Próximo →</span>`;

  const articlesHTML = articles.length > 0
    ? articles.map(a => {
        const h = String(a.published.getHours()).padStart(2, '0');
        const min = String(a.published.getMinutes()).padStart(2, '0');
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
      }).join('\n')
    : '<div class="empty-slot">Ainda sem notícias hoje</div>';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Notícias IA — Professora Crypto</title>
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
  .slot-nav { display: flex; justify-content: center; gap: 6px; padding: 14px 24px; border-bottom: 1px solid #0f0f0f; background: #080810; position: sticky; top: 0; z-index: 100; }
  .slot-tab.search { color: #555; border-color: #222; background: #111; padding: 6px 18px; border-radius: 100px; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; border: 1px solid; cursor: pointer; transition: opacity 0.15s; }
  .search-bar { display: none; padding: 12px 24px; background: #0d0d0d; border-bottom: 1px solid #111; }
  .search-bar.open { display: block; }
  .search-input { width: 100%; max-width: 600px; display: block; margin: 0 auto; background: #111; border: 1px solid #1e1e1e; color: #ddd; padding: 10px 16px; border-radius: 8px; font-size: 14px; font-family: inherit; outline: none; }
  .search-input:focus { border-color: #444; }
  .search-input::placeholder { color: #333; }
  .slot-section { max-width: 760px; margin: 0 auto; padding: 48px 24px; border-bottom: 1px solid #0d0d0d; }
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
  .fab.active { border-color: #555; color: #fff; }
  @media (max-width: 600px) { .hero-title { font-size: 34px; } .slot-section { padding: 32px 16px; } .article-title { font-size: 17px; } }
</style>
</head>
<body>
<div class="hero">
  <div class="hero-label">Inteligência Artificial</div>
  <div class="hero-title">NOTÍCIAS IA</div>
  <div class="hero-sub">Professora Crypto</div>
  <div class="hero-date">${date_pt}</div>
</div>
<div class="pagination">
  ${prevBtn}
  <span class="page-current">${date_compact}</span>
  ${nextBtn}
</div>
<div class="slot-nav">
  <button class="slot-tab search" onclick="toggleSearch()">🔍</button>
</div>
<div class="search-bar" id="searchBar">
  <input class="search-input" id="searchInput" type="text" placeholder="Buscar notícias..." oninput="filterNews(this.value)">
</div>
<div class="slot-section">
  ${articlesHTML}
</div>
<div class="search-empty" id="searchEmpty">Nenhuma notícia encontrada</div>
<div class="footer">Notícias IA &nbsp;·&nbsp; Professora Crypto</div>
<div class="fab-group">
  <button class="fab" id="fabSearch" onclick="toggleSearch()" title="Buscar">🔍</button>
  <button class="fab" onclick="window.scrollBy({top: window.innerHeight * 0.85, behavior:'smooth'})" title="↓">↓</button>
</div>
<script>
  function toggleSearch() {
    const bar = document.getElementById('searchBar');
    const btn = document.getElementById('fabSearch');
    const open = bar.classList.toggle('open');
    btn.classList.toggle('active', open);
    if (open) document.getElementById('searchInput').focus();
    else { filterNews(''); document.getElementById('searchInput').value = ''; }
  }
  function filterNews(q) {
    const term = q.toLowerCase().trim();
    const items = document.querySelectorAll('.article');
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

  // 1. Busca hashes dos arquivos do deploy atual (para preservar histórico)
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

  // 2. Prepara novos arquivos
  const htmlBuf = Buffer.from(htmlContent, 'utf-8');
  const redirectBuf = Buffer.from(
    `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/${slug}/"><title>Notícias IA</title></head><body><script>window.location.replace("/${slug}/")<\/script></body></html>`,
    'utf-8'
  );

  const newFiles = {
    [`/${slug}/index.html`]: htmlBuf,
    '/index.html': redirectBuf,
  };

  // 3. Combina hashes existentes + novos
  const allHashes = { ...existingHashes };
  for (const [path, buf] of Object.entries(newFiles)) {
    allHashes[path] = sha1(buf);
  }

  // 4. Cria novo deploy
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

  // 5. Faz upload apenas dos arquivos novos/alterados
  for (const [path, buf] of Object.entries(newFiles)) {
    const hash = sha1(buf);
    if (!required.has(hash)) continue;

    const upResp = await fetch(
      `https://api.netlify.com/api/v1/deploys/${deployId}/files${path}`,
      {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/octet-stream' },
        body: buf,
      }
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
  console.log(`  NOTÍCIAS IA — rodada: ${slot.toUpperCase()}`);
  console.log(`${'─'.repeat(50)}\n`);

  const today = nowBR();
  const slug = dateSlug(today);

  // Pipeline
  const raw = await fetchFeeds();
  const windowed = filterByWindow(raw, slot);
  const filtered = filterByKeywords(windowed);
  const unique = deduplicate(filtered).slice(0, 15);

  console.log(`Artigos para resumir: ${unique.length}`);

  if (unique.length === 0) {
    console.log('Nenhuma notícia nova. Gerando página vazia...');
  }

  const articles = unique.length > 0 ? await summarize(unique, apiKey) : [];

  // Determina navegação (prev/next) baseado nos arquivos existentes no Netlify
  const prevDate = new Date(today); prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(today); nextDate.setDate(nextDate.getDate() + 1);
  const prevSlug = dateSlug(prevDate);
  const nextSlug = dateSlug(nextDate);

  // Verifica se prev/next existem no deploy atual
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

  const html = generateHTML(articles, today, prevExists ? prevSlug : null, nextExists ? nextSlug : null);
  const url = await deployToNetlify(slug, html, token, siteId);

  console.log(`\n✅ ${articles.length} notícias publicadas!`);
  console.log(`🔗 ${url}\n`);

  return url;
}
