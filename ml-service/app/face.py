"""InsightFace wrapper: detection, alignment, embedding, quality gate and pose proxies."""

from dataclasses import dataclass, field
from functools import lru_cache

import cv2
import numpy as np
from insightface.app import FaceAnalysis
from insightface.utils import face_align

from .config import settings


@dataclass
class FaceObservation:
    embedding: np.ndarray  # L2-normalised, 512-d
    det_score: float
    bbox: list[float]
    blur: float
    brightness: float
    quality: float
    # Pose proxies from the 5 RetinaFace keypoints, in the unmirrored camera frame.
    # yaw > 0: subject turned to *their* left. pitch: nose height between eye line (0)
    # and mouth line (1); it drops when the subject looks up.
    yaw: float
    pitch: float


@dataclass
class Analysis:
    status: str  # ok | no_face | multiple_faces | low_quality
    issues: list[str] = field(default_factory=list)
    face: FaceObservation | None = None


@lru_cache(maxsize=1)
def _engine() -> FaceAnalysis:
    # Only detection + ArcFace recognition; skip the landmark/gender-age models for speed.
    app = FaceAnalysis(
        name=settings.insightface_model,
        allowed_modules=["detection", "recognition"],
        providers=["CPUExecutionProvider"],
    )
    app.prepare(ctx_id=-1, det_size=(settings.det_size, settings.det_size))
    return app


def warm_up() -> None:
    _engine().get(np.zeros((settings.det_size, settings.det_size, 3), dtype=np.uint8))


def decode_image(data: bytes) -> np.ndarray | None:
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    return img


def pose_proxies(kps: np.ndarray) -> tuple[float, float]:
    left_eye, right_eye, nose, mouth_l, mouth_r = kps.astype(np.float64)
    eye_mid = (left_eye + right_eye) / 2
    mouth_mid = (mouth_l + mouth_r) / 2
    eye_vec = right_eye - left_eye
    iod = np.linalg.norm(eye_vec)
    if iod < 1e-6:
        return 0.0, 0.5
    u = eye_vec / iod  # along the eye line, pointing to image-right
    v = np.array([-u[1], u[0]])  # perpendicular, pointing down the face
    nose_off = nose - eye_mid
    mouth_depth = float(np.dot(mouth_mid - eye_mid, v))
    yaw = float(np.dot(nose_off, u) / iod)
    pitch = float(np.dot(nose_off, v) / mouth_depth) if mouth_depth > 1e-6 else 0.5
    return yaw, pitch


def analyze(img: np.ndarray) -> Analysis:
    faces = _engine().get(img)
    faces = [f for f in faces if f.det_score >= settings.min_det_score]
    if not faces:
        return Analysis("no_face", ["No face detected"])

    def size(f) -> float:
        x1, y1, x2, y2 = f.bbox
        return min(x2 - x1, y2 - y1)

    faces.sort(key=size, reverse=True)
    main = faces[0]
    others = [f for f in faces[1:] if size(f) >= settings.background_face_ratio * size(main)]
    if others:
        return Analysis("multiple_faces", ["More than one face in view"])

    crop = face_align.norm_crop(img, main.kps, image_size=112)
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())
    yaw, pitch = pose_proxies(main.kps)

    issues = []
    if size(main) < settings.min_face_px:
        issues.append("Face too small, move closer")
    if blur < settings.min_blur_var:
        issues.append("Image too blurry, hold still")
    if brightness < settings.min_brightness:
        issues.append("Too dark")
    elif brightness > settings.max_brightness:
        issues.append("Too bright")

    quality = float(main.det_score) * min(1.0, blur / (2 * settings.min_blur_var))
    obs = FaceObservation(
        embedding=main.normed_embedding.astype(np.float32),
        det_score=float(main.det_score),
        bbox=[float(x) for x in main.bbox],
        blur=blur,
        brightness=brightness,
        quality=round(quality, 4),
        yaw=yaw,
        pitch=pitch,
    )
    return Analysis("low_quality" if issues else "ok", issues, obs)
