"""Attendance attempts: stable identity across frames plus a random head-movement challenge.

An attempt is accepted only when the same person has been matched in `stable_frames`
consecutive frames AND, within that same identity streak, we saw a frontal baseline
followed by the requested head movement. A printed photo cannot perform the movement.
"""

import random
import secrets
import threading
import time
from dataclasses import dataclass, field

from .config import settings
from .face import FaceObservation

CHALLENGES = {
    "turn_left": "Slowly turn your head to your left",
    "turn_right": "Slowly turn your head to your right",
    "look_up": "Tilt your head up a little",
}


@dataclass
class Attempt:
    id: str
    session_id: int
    challenge: str
    created: float = field(default_factory=time.monotonic)
    user_id: int | None = None
    streak: int = 0
    sims: list[float] = field(default_factory=list)
    baseline_yaw: float | None = None
    baseline_pitch: float | None = None
    challenge_done: bool = False

    def reset_identity(self, user_id: int | None) -> None:
        self.user_id = user_id
        self.streak = 0
        self.sims = []
        self.baseline_yaw = None
        self.baseline_pitch = None
        self.challenge_done = False

    def observe(self, user_id: int, sim: float, obs: FaceObservation) -> None:
        if user_id != self.user_id:
            self.reset_identity(user_id)
        self.streak += 1
        self.sims.append(sim)

        if abs(obs.yaw) <= settings.frontal_yaw_max and not self.challenge_done:
            self.baseline_yaw = obs.yaw
            self.baseline_pitch = obs.pitch
            return
        if self.baseline_yaw is None:
            return
        dyaw = obs.yaw - self.baseline_yaw
        dpitch = obs.pitch - self.baseline_pitch
        if self.challenge == "turn_left" and dyaw >= settings.challenge_yaw_delta:
            self.challenge_done = True
        elif self.challenge == "turn_right" and dyaw <= -settings.challenge_yaw_delta:
            self.challenge_done = True
        elif self.challenge == "look_up" and dpitch <= -settings.challenge_pitch_delta:
            self.challenge_done = True

    @property
    def complete(self) -> bool:
        return self.challenge_done and self.streak >= settings.stable_frames

    def prompt(self) -> str:
        if self.baseline_yaw is None:
            return "Look straight at the camera"
        if not self.challenge_done:
            return CHALLENGES[self.challenge]
        return "Hold still…"


_attempts: dict[str, Attempt] = {}
_lock = threading.Lock()


def get_or_create(attempt_id: str | None, session_id: int) -> Attempt:
    with _lock:
        now = time.monotonic()
        for k in [k for k, a in _attempts.items() if now - a.created > settings.attempt_ttl_s]:
            del _attempts[k]
        attempt = _attempts.get(attempt_id) if attempt_id else None
        if attempt is None or attempt.session_id != session_id:
            attempt = Attempt(
                id=secrets.token_urlsafe(12),
                session_id=session_id,
                challenge=random.choice(list(CHALLENGES)),
            )
            _attempts[attempt.id] = attempt
        return attempt


def finish(attempt_id: str) -> None:
    with _lock:
        _attempts.pop(attempt_id, None)
