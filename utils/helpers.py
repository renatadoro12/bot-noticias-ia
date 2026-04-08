"""Utility functions."""
import os
import yaml
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from difflib import SequenceMatcher
from typing import Any

TIMEZONE = ZoneInfo("America/Sao_Paulo")

SLOT_WINDOWS = {
    "manha":  {"start_h": 22, "end_h": 8,  "label": "Manhã",  "prev_day": True},
    "tarde":  {"start_h": 8,  "end_h": 16, "label": "Tarde",  "prev_day": False},
    "noite":  {"start_h": 16, "end_h": 22, "label": "Noite",  "prev_day": False},
}

SLOT_BY_HOUR = {8: "manha", 16: "tarde", 22: "noite"}


def load_config(path: str = None) -> dict[str, Any]:
    if path is None:
        path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.yaml")
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def now_br() -> datetime:
    return datetime.now(TIMEZONE)


def current_slot() -> str:
    h = now_br().hour
    if 8 <= h < 16:
        return "tarde"
    if 16 <= h < 22:
        return "noite"
    return "manha"


def slot_window(slot: str, reference: datetime) -> tuple[datetime, datetime]:
    """Return (start, end) UTC datetimes for the given slot."""
    from datetime import timedelta
    w = SLOT_WINDOWS[slot]
    ref_br = reference.astimezone(TIMEZONE)

    end_br = ref_br.replace(hour=w["end_h"], minute=0, second=0, microsecond=0)
    if slot == "manha":
        start_br = (ref_br - timedelta(days=1)).replace(
            hour=w["start_h"], minute=0, second=0, microsecond=0
        )
    else:
        start_br = ref_br.replace(hour=w["start_h"], minute=0, second=0, microsecond=0)

    return start_br.astimezone(timezone.utc), end_br.astimezone(timezone.utc)


def titles_similar(a: str, b: str, threshold: float = 0.75) -> bool:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio() >= threshold


def all_feeds(config: dict) -> list[str]:
    feeds = []
    for urls in config.get("feeds", {}).values():
        feeds.extend(urls)
    return feeds
