"""Filter articles by AI-related keywords."""
import re
from utils.logger import get_logger

log = get_logger()


def _matches(text: str, keywords: list[str]) -> bool:
    lower = text.lower()
    for kw in keywords:
        if re.search(r"\b" + re.escape(kw.lower()) + r"\b", lower):
            return True
    return False


def filter_by_keywords(articles: list[dict], keywords: list[str]) -> list[dict]:
    filtered = []
    for a in articles:
        combined = f"{a['title']} {a.get('summary', '')}"
        if _matches(combined, keywords):
            filtered.append(a)
        else:
            log.debug(f"Sem keywords de IA: {a['title'][:60]}")

    log.info(f"Após filtro de keywords: {len(filtered)}/{len(articles)} artigos")
    return filtered
