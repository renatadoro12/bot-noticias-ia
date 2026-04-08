"""Parallel RSS feed fetcher."""
import re
import time
import random
import feedparser
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional
from utils.logger import get_logger

log = get_logger()


def _clean_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text or "")
    return re.sub(r"\s+", " ", text).strip()


def _parse_entry(entry: feedparser.FeedParserDict, source: str, feed_url: str) -> Optional[dict]:
    title = _clean_html(entry.get("title", "")).strip()
    if not title:
        return None

    url = entry.get("link", "").strip()
    if not url:
        return None

    # Parse published date
    published_utc: Optional[datetime] = None
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        try:
            published_utc = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        except Exception:
            pass

    if published_utc is None:
        log.debug(f"Ignorada - sem data: {title} | {source}")
        return None

    # Ignore future dates
    if published_utc > datetime.now(timezone.utc):
        return None

    summary = _clean_html(
        entry.get("summary", entry.get("description", ""))
    )[:500]

    return {
        "url": url,
        "title": title,
        "source": source,
        "summary": summary,
        "published_utc": published_utc,
    }


def _fetch_feed(feed_url: str, config: dict, delay_range: tuple) -> list[dict]:
    time.sleep(random.uniform(*delay_range))
    headers = {"User-Agent": config["http"]["user_agent"]}
    timeout = config["http"]["timeout"]
    retries = config["http"]["retries"]

    for attempt in range(retries):
        try:
            feed = feedparser.parse(feed_url, request_headers=headers)
            if feed.bozo and not feed.entries:
                raise ValueError(f"Feed inválido: {feed.bozo_exception}")

            source = feed.feed.get("title", feed_url)
            articles = []
            has_any_date = False

            for entry in feed.entries[:20]:
                parsed = _parse_entry(entry, source, feed_url)
                if parsed:
                    has_any_date = True
                    articles.append(parsed)
                elif hasattr(entry, "published_parsed") and entry.published_parsed:
                    has_any_date = True

            if not has_any_date and feed.entries:
                log.warning(f"Fonte sem datas válidas, ignorada nesta rodada: {feed_url}")
                return []

            return articles

        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                log.warning(f"Falha ao buscar {feed_url}: {e}")
                return []

    return []


def fetch_all(config: dict) -> list[dict]:
    """Fetch all feeds in parallel. Returns raw article list."""
    all_urls = []
    for urls in config.get("feeds", {}).values():
        all_urls.extend(urls)

    delay_range = (
        config["http"]["min_delay"],
        config["http"]["max_delay"],
    )

    articles: list[dict] = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(_fetch_feed, url, config, delay_range): url
            for url in all_urls
        }
        for future in as_completed(futures):
            try:
                articles.extend(future.result())
            except Exception as e:
                log.error(f"Executor error: {e}")

    log.info(f"Total coletado: {len(articles)} artigos de {len(all_urls)} fontes")
    return articles
