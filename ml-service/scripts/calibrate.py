"""Pick the match threshold from your own data instead of guessing.

Uses the enrolled embeddings to build genuine (same person) and impostor (different
people) similarity distributions, then summarises the live scores in recognition_log.

    uv run python scripts/calibrate.py
"""

import sys
from pathlib import Path

import numpy as np
import psycopg
from pgvector.psycopg import register_vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import settings  # noqa: E402


def pct(a, qs=(1, 5, 50, 95, 99)):
    return "  ".join(f"p{q}={np.percentile(a, q):.3f}" for q in qs) if len(a) else "(no data)"


def main() -> None:
    with psycopg.connect(settings.database_url) as conn:
        register_vector(conn)
        rows = conn.execute("SELECT user_id, pose, embedding FROM face_embeddings").fetchall()
        log = conn.execute(
            "SELECT status, top1_sim, top2_sim FROM recognition_log WHERE top1_sim IS NOT NULL"
        ).fetchall()

    if not rows:
        raise SystemExit("No embeddings enrolled yet.")
    users = np.array([r[0] for r in rows])
    poses = np.array([r[1] for r in rows])
    emb = np.stack([np.asarray(r[2].to_numpy(), dtype=np.float32) for r in rows])
    sims = emb @ emb.T

    genuine, impostor = [], []
    for i in range(len(rows)):
        if poses[i] != "front":
            continue  # probe = a frontal frame, gallery = every other stored frame
        same = (users == users[i]) & (np.arange(len(rows)) != i)
        genuine.extend(sims[i, same])
        other = users != users[i]
        for u in np.unique(users[other]):
            impostor.append(sims[i, users == u].max())  # best-matching frame per other person

    genuine, impostor = np.array(genuine), np.array(impostor)
    print(f"{len(np.unique(users))} people, {len(rows)} embeddings")
    print(f"genuine  (same person):    {pct(genuine)}")
    print(f"impostor (best other):     {pct(impostor)}")
    if len(impostor):
        safe = float(impostor.max()) + 0.05
        frr = float((genuine < safe).mean()) if len(genuine) else float("nan")
        print(f"\nhighest impostor score: {impostor.max():.3f}")
        print(f"suggested MATCH_THRESHOLD ≈ {max(safe, 0.35):.2f} (frame-level false reject ≈ {frr:.1%})")
    print(f"current MATCH_THRESHOLD = {settings.match_threshold}, MATCH_MARGIN = {settings.match_margin}")

    if log:
        by = {}
        for status, t1, t2 in log:
            by.setdefault(status, []).append((t1, t2 or 0.0))
        print("\nLive recognition_log scores:")
        for status, v in sorted(by.items()):
            t1 = np.array([x[0] for x in v])
            gap = np.array([x[0] - x[1] for x in v])
            print(f"  {status:<15} n={len(v):<5} top1: {pct(t1, (5, 50, 95))}   gap: {pct(gap, (5, 50))}")


if __name__ == "__main__":
    main()
