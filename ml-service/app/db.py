from pathlib import Path

import psycopg
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import settings

SCHEMA = Path(__file__).with_name("schema.sql")


def _configure(conn: psycopg.Connection) -> None:
    register_vector(conn)
    # HNSW returns at most ef_search rows; keep it above the candidate pool size.
    conn.execute(f"SET hnsw.ef_search = {max(100, settings.candidate_pool * 2)}")
    conn.commit()


pool = ConnectionPool(
    settings.database_url,
    min_size=1,
    max_size=10,
    open=False,
    configure=_configure,
    kwargs={"row_factory": dict_row},
)


def init_db() -> None:
    with psycopg.connect(settings.database_url, autocommit=True) as conn:
        conn.execute(SCHEMA.read_text())
    pool.open(wait=True)
