"""Filter articles by time window for each scheduled slot."""
from datetime import datetime, timezone, timedelta
from utils.helpers import slot_window
from utils.logger import get_logger

log = get_logger()

MAX_AGE_HOURS = 12  # nunca aceitar artigos com mais de 12h


def filter_by_window(articles: list[dict], slot: str, reference: datetime) -> list[dict]:
    """Keep only articles published within the slot's time window and within MAX_AGE_HOURS."""
    start_utc, end_utc = slot_window(slot, reference)
    now_utc = datetime.now(timezone.utc)
    hard_cutoff = now_utc - timedelta(hours=MAX_AGE_HOURS)

    # Use whichever start is more recent
    effective_start = max(start_utc, hard_cutoff)

    filtered = []
    for a in articles:
        pub = a["published_utc"]
        if effective_start <= pub <= now_utc:
            filtered.append(a)
        else:
            log.debug(f"Fora da janela [{slot}] {pub.isoformat()} | {a['title'][:60]}")

    log.info(f"Após filtro de data [{slot}]: {len(filtered)}/{len(articles)} artigos")
    return filtered
