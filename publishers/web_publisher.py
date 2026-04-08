"""Generate HTML page and deploy to Netlify."""
import os
from datetime import datetime
from zoneinfo import ZoneInfo
from jinja2 import Environment, FileSystemLoader
from storage import database
from publishers import netlify_deploy
from utils.helpers import SLOT_WINDOWS, now_br
from utils.logger import get_logger

log = get_logger()

TIMEZONE = ZoneInfo("America/Sao_Paulo")

MONTHS_PT = {
    1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
    5: "maio", 6: "junho", 7: "julho", 8: "agosto",
    9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro",
}


def _date_labels(today: datetime) -> dict:
    return {
        "date_pt": f"{today.day} de {MONTHS_PT[today.month]} de {today.year}".upper(),
        "date_compact": f"{today.day:02d} {MONTHS_PT[today.month][:3].capitalize()} {today.year}",
        "date_slug": today.strftime("%Y-%m-%d"),
    }


def generate_and_deploy(
    new_articles: list[dict],
    slot: str,
    db_path: str,
    output_base: str,
    netlify_token: str,
    netlify_site_id: str,
) -> str:
    today = now_br()
    run_date = today.strftime("%Y-%m-%d")
    labels = _date_labels(today)

    # Save new articles to DB
    for a in new_articles:
        pub = a.get("published_time", "--:--")
        # Reconstruct full ISO published string for storage
        database.insert_article(
            db_path=db_path,
            url=a["url"],
            title=a["title"],
            source=a["source"],
            published=f"{run_date}T{pub}:00",
            slot=slot,
            run_date=run_date,
            summary=a.get("summary", ""),
        )

    # Load all articles for today from DB
    rows = database.get_articles_for_date(db_path, run_date)

    grouped: dict[str, list] = {s: [] for s in SLOT_WINDOWS}
    for row in rows:
        s = row["slot"]
        if s in grouped:
            grouped[s].append(dict(row))

    # Navigation slugs
    from datetime import timedelta
    prev_slug = (today - timedelta(days=1)).strftime("%Y-%m-%d")
    next_slug = (today + timedelta(days=1)).strftime("%Y-%m-%d")
    prev_exists = os.path.exists(os.path.join(output_base, prev_slug, "index.html"))
    next_exists = os.path.exists(os.path.join(output_base, next_slug, "index.html"))

    # Render HTML
    templates_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")
    env = Environment(loader=FileSystemLoader(templates_dir))
    template = env.get_template("index.html")
    html = template.render(
        **labels,
        grouped=grouped,
        slot_windows=SLOT_WINDOWS,
        prev_slug=prev_slug if prev_exists else None,
        next_slug=next_slug if next_exists else None,
        current_slot=slot,
    )

    # Write HTML
    out_dir = os.path.join(output_base, run_date)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "index.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    log.info(f"Página gerada: {out_path}")

    # Deploy
    if netlify_token and netlify_site_id:
        return netlify_deploy.deploy(output_base, run_date, netlify_token, netlify_site_id)

    log.warning("NETLIFY_TOKEN ou NETLIFY_SITE_ID não definidos — sem deploy")
    return out_path
