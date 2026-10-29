from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://attendance:attendance@localhost:5433/attendance"
    # 0 lets serverless databases (Neon) sleep when idle instead of being held awake.
    db_pool_min_size: int = 1
    db_pool_max_idle_s: float = 600
    jwt_secret: str = "dev-secret-change-me"
    jwt_ttl_hours: int = 12
    # Public /signup page. The very first account becomes admin; later ones are teachers awaiting approval.
    allow_signup: bool = True
    cors_origins: list[str] = ["http://localhost:3000"]
    # Used for "today" in SQL; set per connection so managed databases need no server config.
    timezone: str = "Asia/Kolkata"

    insightface_model: str = "buffalo_l"
    det_size: int = 640

    # Quality gate (applied to every frame, enrollment and recognition)
    min_det_score: float = 0.65
    min_face_px: int = 100
    min_blur_var: float = 40.0  # Laplacian variance on the aligned 112x112 crop
    min_brightness: float = 50.0
    max_brightness: float = 210.0
    # Faces smaller than this fraction of the largest face are treated as background
    background_face_ratio: float = 0.4

    # Matching (cosine similarity on ArcFace embeddings)
    match_threshold: float = 0.45
    match_margin: float = 0.08
    stable_frames: int = 3
    candidate_pool: int = 64

    # Enrollment
    duplicate_threshold: float = 0.5
    enroll_consistency_threshold: float = 0.25
    frames_per_pose_max: int = 5
    frames_required: dict[str, int] = {"front": 3, "left": 2, "right": 2, "up": 2, "down": 2}
    draft_ttl_s: int = 900

    # Liveness challenge, in units of the keypoint pose proxies (see face.py)
    attempt_ttl_s: int = 20
    challenge_yaw_delta: float = 0.15
    challenge_pitch_delta: float = 0.10
    frontal_yaw_max: float = 0.10

    # Sessions accept face marks from this many minutes before start until after end
    session_grace_min: int = 15

    # Flag users for re-enrollment when their recent face-match confidence drops below this
    reenroll_confidence: float = 0.52
    reenroll_window: int = 5


settings = Settings()
