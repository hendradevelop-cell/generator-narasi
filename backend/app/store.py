from __future__ import annotations

import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timezone

from .config import settings
from .textutil import normalize_text


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.data_dir / "history.sqlite")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS narrations (
            id TEXT PRIMARY KEY,
            topik TEXT,
            teks TEXT,
            teks_normal TEXT,
            created_at TEXT
        )
        """
    )
    return conn


def save_narration(topik: str, teks: str) -> None:
    with closing(_connect()) as conn:
        conn.execute(
            "INSERT INTO narrations (id, topik, teks, teks_normal, created_at) VALUES (?, ?, ?, ?, ?)",
            (
                uuid.uuid4().hex,
                topik,
                teks,
                normalize_text(teks),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()


def recent_narrations(limit: int = 200) -> list[tuple[str, str]]:
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT topik, teks FROM narrations ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [(row[0] or "", row[1] or "") for row in rows]
