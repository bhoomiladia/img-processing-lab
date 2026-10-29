"""Multi-angle enrollment drafts, held in memory until /enroll/complete."""

import secrets
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np

from .config import settings
from .face import FaceObservation

POSES = ("front", "left", "right", "up", "down")


@dataclass
class Draft:
    id: str
    name: str
    roll_no: str
    class_id: int
    consent_at: datetime
    consent_version: str
    created_by: int
    reenroll_user_id: int | None
    created: float = field(default_factory=time.monotonic)
    frames: dict[str, list[FaceObservation]] = field(default_factory=lambda: {p: [] for p in POSES})

    def counts(self) -> dict[str, int]:
        return {p: len(v) for p, v in self.frames.items()}

    def missing(self) -> dict[str, int]:
        return {
            p: need - len(self.frames[p])
            for p, need in settings.frames_required.items()
            if len(self.frames[p]) < need
        }

    def front_centroid(self) -> np.ndarray | None:
        if not self.frames["front"]:
            return None
        c = np.mean([f.embedding for f in self.frames["front"]], axis=0)
        return c / np.linalg.norm(c)

    def front_pitch(self) -> float | None:
        if not self.frames["front"]:
            return None
        return float(np.mean([f.pitch for f in self.frames["front"]]))


_drafts: dict[str, Draft] = {}
_lock = threading.Lock()


def create_draft(**kwargs) -> Draft:
    draft = Draft(id=secrets.token_urlsafe(16), consent_at=datetime.now(timezone.utc), **kwargs)
    with _lock:
        _evict()
        _drafts[draft.id] = draft
    return draft


def get_draft(draft_id: str) -> Draft | None:
    with _lock:
        _evict()
        return _drafts.get(draft_id)


def drop_draft(draft_id: str) -> None:
    with _lock:
        _drafts.pop(draft_id, None)


def _evict() -> None:
    now = time.monotonic()
    for k in [k for k, d in _drafts.items() if now - d.created > settings.draft_ttl_s]:
        del _drafts[k]


def check_pose(draft: Draft, pose: str, obs: FaceObservation) -> str | None:
    """Server-side sanity check that the frame shows the pose the client claims."""
    yaw, pitch = obs.yaw, obs.pitch
    if pose == "front":
        if abs(yaw) > settings.frontal_yaw_max * 1.5:
            return "Look straight at the camera"
        return None
    if pose == "left" and yaw < settings.challenge_yaw_delta * 0.6:
        return "Turn your head further to your left"
    if pose == "right" and yaw > -settings.challenge_yaw_delta * 0.6:
        return "Turn your head further to your right"
    if pose in ("up", "down"):
        base = draft.front_pitch()
        if base is None:
            return "Capture the front pose first"
        delta = pitch - base
        if pose == "up" and delta > -settings.challenge_pitch_delta * 0.5:
            return "Tilt your head further up"
        if pose == "down" and delta < settings.challenge_pitch_delta * 0.5:
            return "Tilt your head further down"
    return None


def check_same_person(draft: Draft, pose: str, obs: FaceObservation) -> str | None:
    centroid = draft.front_centroid()
    if centroid is None:
        return None
    sim = float(np.dot(centroid, obs.embedding))
    # Profile views legitimately score lower against the frontal centroid.
    floor = 0.5 if pose == "front" else settings.enroll_consistency_threshold
    if sim < floor:
        return "Face doesn't match the earlier frames. Only one person should enroll at a time"
    return None
