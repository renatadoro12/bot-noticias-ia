"""Entry point for the AI News Bot."""
import sys
import os

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import argparse
from datetime import datetime
from dotenv import load_dotenv
from zoneinfo import ZoneInfo

load_dotenv()

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.logger import get_logger
from utils.helpers import load_config, current_slot, now_br
from storage.database import init_db, url_exists, get_titles_for_date, cleanup_old
from sources.rss_reader import fetch_all
from sources.summarizer import summarize
from filters.date_filter import filter_by_window
from filters.ai_filter import filter_by_keywords
from publishers.web_publisher import generate_and_deploy

log = get_logger()
TIMEZONE = ZoneInfo("America/Sao_Paulo")


def run_pipeline(slot: str) -> None:
    config = load_config()

    # Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(base_dir, config["database"]["path"])
    output_base = os.path.join(base_dir, "output")

    # Env
    api_key = os.getenv("ANTHROPIC_API_KEY")
    netlify_token = os.getenv("NETLIFY_TOKEN", "")
    netlify_site_id = os.getenv("NETLIFY_SITE_ID", "")

    if not api_key:
        log.error("ANTHROPIC_API_KEY não encontrada no .env")
        sys.exit(1)

    # Init DB
    init_db(db_path)

    # Cleanup old articles
    removed = cleanup_old(db_path, config["database"]["cleanup_days"])
    if removed:
        log.info(f"Limpeza: {removed} artigos antigos removidos")

    reference = now_br()
    run_date = reference.strftime("%Y-%m-%d")

    print()
    print("━" * 50)
    print(f"  NOTÍCIAS IA — rodada: {slot.upper()} ({run_date})")
    print("━" * 50)
    print()

    # 1. Fetch
    log.info("Buscando feeds RSS...")
    raw = fetch_all(config)

    # 2. Date filter
    log.info(f"Filtrando por janela de tempo [{slot}]...")
    windowed = filter_by_window(raw, slot, reference)

    # 3. AI keyword filter
    log.info("Filtrando por palavras-chave de IA...")
    ai_articles = filter_by_keywords(windowed, config["keywords"])

    # 4. Deduplication
    log.info("Removendo duplicatas...")
    existing_titles = get_titles_for_date(db_path, run_date)
    unique = []
    from utils.helpers import titles_similar
    for a in ai_articles:
        if url_exists(db_path, a["url"]):
            log.debug(f"URL duplicada: {a['url']}")
            continue
        if any(titles_similar(a["title"], t) for t in existing_titles):
            log.debug(f"Título similar já existe: {a['title'][:60]}")
            continue
        unique.append(a)
        existing_titles.append(a["title"])

    log.info(f"Artigos únicos para processar: {len(unique)}")

    max_articles = config["output"].get("max_articles_per_run", 15)
    unique = unique[:max_articles]

    if not unique:
        log.warning("Nenhuma notícia nova encontrada nesta rodada.")
        # Still generate/update the page so navigation stays consistent
        url = generate_and_deploy(
            [], slot, db_path, output_base, netlify_token, netlify_site_id
        )
        print(f"Página atualizada: {url}")
        print()
        return

    # 5. Summarize with Claude
    log.info(f"Resumindo {len(unique)} artigos com Claude...")
    summarized = summarize(unique, api_key, run_date)

    # 6. Generate HTML + Deploy
    log.info("Gerando página e fazendo deploy...")
    url = generate_and_deploy(
        summarized, slot, db_path, output_base, netlify_token, netlify_site_id
    )

    print()
    print("━" * 50)
    print(f"  ✅  {len(summarized)} notícias publicadas!")
    print(f"  🔗  {url}")
    print("━" * 50)
    print()

    # Copy to clipboard on Windows
    if sys.platform == "win32" and url.startswith("http"):
        try:
            import subprocess
            subprocess.run(["clip"], input=url.encode(), check=True)
            print("  📋  Link copiado para a área de transferência!")
        except Exception:
            pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Bot de Notícias IA")
    parser.add_argument(
        "--slot",
        choices=["manha", "tarde", "noite"],
        default=None,
        help="Slot a executar (padrão: detectado automaticamente pelo horário atual)",
    )
    parser.add_argument(
        "--schedule",
        action="store_true",
        help="Iniciar scheduler contínuo (08h, 16h, 22h)",
    )
    args = parser.parse_args()

    if args.schedule:
        import scheduler
        scheduler.start()
    else:
        slot = args.slot or current_slot()
        run_pipeline(slot)


if __name__ == "__main__":
    main()
