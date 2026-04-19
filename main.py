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

    from utils.helpers import titles_similar

    # 1. Fetch
    log.info("Buscando feeds RSS...")
    raw = fetch_all(config)

    # Split by category
    raw_ia = [a for a in raw if a.get("feed_category") != "tech"]
    raw_tech = [a for a in raw if a.get("feed_category") == "tech"]

    # 2. Date filter
    log.info(f"Filtrando por janela de tempo [{slot}]...")
    windowed_ia = filter_by_window(raw_ia, slot, reference)
    windowed_tech = filter_by_window(raw_tech, slot, reference)

    # 3. Keyword filters
    log.info("Filtrando por palavras-chave de IA...")
    ai_articles = filter_by_keywords(windowed_ia, config["keywords"])

    log.info("Filtrando por palavras-chave de tecnologia...")
    tech_articles = filter_by_keywords(windowed_tech, config.get("tech_keywords", []))

    # 4. Deduplication
    log.info("Removendo duplicatas...")
    existing_titles = get_titles_for_date(db_path, run_date)

    def deduplicate(articles, existing):
        unique = []
        for a in articles:
            if url_exists(db_path, a["url"]):
                continue
            if any(titles_similar(a["title"], t) for t in existing):
                continue
            unique.append(a)
            existing.append(a["title"])
        return unique

    unique_ia = deduplicate(ai_articles, existing_titles)
    unique_tech = deduplicate(tech_articles, existing_titles)

    max_ia = config["output"].get("max_articles_per_run", 15)
    max_tech = config["output"].get("max_tech_articles_per_run", 10)
    unique_ia = unique_ia[:max_ia]
    unique_tech = unique_tech[:max_tech]

    log.info(f"IA: {len(unique_ia)} artigos únicos | Tech: {len(unique_tech)} artigos únicos")

    # 5. Summarize with Claude
    summarized_ia, summarized_tech = [], []
    if unique_ia:
        log.info(f"Resumindo {len(unique_ia)} artigos de IA com Claude...")
        summarized_ia = summarize(unique_ia, api_key, run_date)
    if unique_tech:
        log.info(f"Resumindo {len(unique_tech)} artigos de tech com Claude...")
        summarized_tech = summarize(unique_tech, api_key, run_date)

    if not summarized_ia and not summarized_tech:
        log.warning("Nenhuma notícia nova encontrada nesta rodada.")
        url = generate_and_deploy(
            [], [], slot, db_path, output_base, netlify_token, netlify_site_id
        )
        print(f"Página atualizada: {url}")
        print()
        return

    # 6. Generate HTML + Deploy
    log.info("Gerando página e fazendo deploy...")
    url = generate_and_deploy(
        summarized_ia, summarized_tech, slot, db_path, output_base, netlify_token, netlify_site_id
    )

    total = len(summarized_ia) + len(summarized_tech)
    print()
    print("━" * 50)
    print(f"  ✅  {total} notícias publicadas! (IA: {len(summarized_ia)} | Tech: {len(summarized_tech)})")
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
