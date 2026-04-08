"""SQLite storage for published articles."""
import sqlite3
import os
from datetime import datetime, timezone, timedelta
from typing import Optional
from utils.logger import get_logger

log = get_logger()


def _conn(db_path: str) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db(db_path: str) -> None:
    with _conn(db_path) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS articles (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                url         TEXT NOT NULL UNIQUE,
                title       TEXT NOT NULL,
                source      TEXT NOT NULL,
                published   TEXT NOT NULL,
                slot        TEXT NOT NULL,
                run_date    TEXT NOT NULL,
                summary     TEXT,
                fetched_at  TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_url        ON articles(url);
            CREATE INDEX IF NOT EXISTS idx_run_date   ON articles(run_date);
            CREATE INDEX IF NOT EXISTS idx_slot       ON articles(slot);
            CREATE INDEX IF NOT EXISTS idx_published  ON articles(published);
        """)


def url_exists(db_path: str, url: str) -> bool:
    with _conn(db_path) as conn:
        row = conn.execute("SELECT 1 FROM articles WHERE url = ?", (url,)).fetchone()
        return row is not None


def get_titles_for_date(db_path: str, run_date: str) -> list[str]:
    with _conn(db_path) as conn:
        rows = conn.execute(
            "SELECT title FROM articles WHERE run_date = ?", (run_date,)
        ).fetchall()
        return [r["title"] for r in rows]


def insert_article(
    db_path: str,
    url: str,
    title: str,
    source: str,
    published: str,
    slot: str,
    run_date: str,
    summary: str,
) -> None:
    try:
        with _conn(db_path) as conn:
            conn.execute(
                """INSERT OR IGNORE INTO articles
                   (url, title, source, published, slot, run_date, summary, fetched_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (url, title, source, published, slot, run_date, summary,
                 datetime.now(timezone.utc).isoformat()),
            )
    except sqlite3.Error as e:
        log.error(f"DB insert error: {e}")


def get_articles_for_date(db_path: str, run_date: str) -> list[sqlite3.Row]:
    with _conn(db_path) as conn:
        return conn.execute(
            """SELECT * FROM articles
               WHERE run_date = ?
               ORDER BY slot, published""",
            (run_date,),
        ).fetchall()


def cleanup_old(db_path: str, days: int = 30) -> int:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    with _conn(db_path) as conn:
        cur = conn.execute("DELETE FROM articles WHERE run_date < ?", (cutoff,))
        return cur.rowcount
