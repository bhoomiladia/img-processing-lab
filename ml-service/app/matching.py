from dataclasses import dataclass

import numpy as np
import psycopg

from .config import settings


@dataclass
class Match:
    user_id: int | None
    top1: float
    top2: float
    accepted: bool


def rank_users(conn: psycopg.Connection, embedding: np.ndarray) -> list[tuple[int, float]]:
    """Nearest stored embeddings via the HNSW index, reduced to best similarity per user."""
    rows = conn.execute(
        """
        SELECT user_id, 1 - (embedding <=> %(e)s) AS sim
        FROM face_embeddings
        ORDER BY embedding <=> %(e)s
        LIMIT %(k)s
        """,
        {"e": embedding, "k": settings.candidate_pool},
    ).fetchall()
    best: dict[int, float] = {}
    for r in rows:
        best[r["user_id"]] = max(best.get(r["user_id"], -1.0), float(r["sim"]))
    return sorted(best.items(), key=lambda kv: kv[1], reverse=True)


def match(conn: psycopg.Connection, embedding: np.ndarray) -> Match:
    ranked = rank_users(conn, embedding)
    if not ranked:
        return Match(None, 0.0, 0.0, False)
    user_id, top1 = ranked[0]
    top2 = ranked[1][1] if len(ranked) > 1 else 0.0
    accepted = top1 >= settings.match_threshold and (top1 - top2) >= settings.match_margin
    return Match(user_id, top1, top2, accepted)
