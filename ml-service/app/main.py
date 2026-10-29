import csv
import io
import logging
import secrets
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from statistics import mean
from typing import Literal

import psycopg
from fastapi import FastAPI, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import enrollment, recognition
from .auth import AdminDep, Staff, StaffDep, hash_password, issue_token, verify_password
from .config import settings
from .db import init_db, pool
from .face import analyze, decode_image, warm_up
from .matching import match, rank_users

log = logging.getLogger("attendance")

CONSENT_VERSION = "2026-10-v1"


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    warm_up()
    yield
    pool.close()


app = FastAPI(title="Face Attendance API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def read_image(image: UploadFile):
    # Sync on purpose: frame endpoints run in the threadpool so inference doesn't block the loop.
    data = image.file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(413, "Image too large")
    img = decode_image(data)
    if img is None:
        raise HTTPException(400, "Could not decode image")
    return img


@app.get("/health")
def health():
    return {"ok": True}


# ---------------------------------------------------------------- auth / staff


class LoginIn(BaseModel):
    email: str
    password: str


PROFILE_COLS = "id, email, name, role, must_change_password, onboarded_at IS NOT NULL AS onboarded"


def _profile(conn, staff_id: int):
    row = conn.execute(f"SELECT {PROFILE_COLS} FROM staff WHERE id = %s", (staff_id,)).fetchone()
    if not row:
        raise HTTPException(401, "Account no longer exists")
    return row


@app.post("/auth/login")
def login(body: LoginIn):
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT id, name, role, password_hash, approved FROM staff WHERE email = %s",
            (body.email.strip().lower(),),
        ).fetchone()
        if not row or not verify_password(body.password, row["password_hash"]):
            raise HTTPException(401, "Wrong email or password")
        if not row["approved"]:
            raise HTTPException(403, "Your account is waiting for an admin to approve it")
        staff = Staff(id=row["id"], name=row["name"], role=row["role"])
        return {"token": issue_token(staff), "staff": _profile(conn, staff.id)}


class SignupIn(BaseModel):
    name: str = Field(min_length=1)
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8)


@app.get("/auth/signup-status")
def signup_status():
    with pool.connection() as conn:
        has_staff = conn.execute("SELECT EXISTS (SELECT 1 FROM staff) AS e").fetchone()["e"]
    return {"allow_signup": settings.allow_signup or not has_staff, "needs_first_admin": not has_staff}


@app.post("/auth/signup", status_code=201)
def signup(body: SignupIn):
    email = body.email.strip().lower()
    with pool.connection() as conn, conn.transaction():
        # Serialise sign-ups so two people can't both become the first admin.
        conn.execute("LOCK TABLE staff IN SHARE ROW EXCLUSIVE MODE")
        first = not conn.execute("SELECT EXISTS (SELECT 1 FROM staff) AS e").fetchone()["e"]
        if not first and not settings.allow_signup:
            raise HTTPException(403, "Sign-up is turned off. Ask your admin for an account")
        if conn.execute("SELECT 1 FROM staff WHERE email = %s", (email,)).fetchone():
            raise HTTPException(409, "An account with that email already exists")
        row = conn.execute(
            "INSERT INTO staff (email, name, role, password_hash, approved) VALUES (%s, %s, %s, %s, %s)"
            " RETURNING id, name, role",
            (email, body.name.strip(), "admin" if first else "teacher", hash_password(body.password), first),
        ).fetchone()
        if not first:
            return {"status": "pending"}
        staff = Staff(id=row["id"], name=row["name"], role=row["role"])
        return {"status": "active", "token": issue_token(staff), "staff": _profile(conn, staff.id)}


@app.get("/auth/me")
def me(staff: StaffDep):
    with pool.connection() as conn:
        return _profile(conn, staff.id)


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


@app.post("/auth/password")
def change_password(body: PasswordIn, staff: StaffDep):
    with pool.connection() as conn:
        row = conn.execute("SELECT password_hash FROM staff WHERE id = %s", (staff.id,)).fetchone()
        if not verify_password(body.current_password, row["password_hash"]):
            raise HTTPException(400, "Current password is incorrect")
        if body.current_password == body.new_password:
            raise HTTPException(400, "Choose a password different from the current one")
        conn.execute(
            "UPDATE staff SET password_hash = %s, must_change_password = false WHERE id = %s",
            (hash_password(body.new_password), staff.id),
        )
        return _profile(conn, staff.id)


@app.post("/auth/onboarded")
def finish_onboarding(staff: StaffDep):
    with pool.connection() as conn:
        conn.execute("UPDATE staff SET onboarded_at = coalesce(onboarded_at, now()) WHERE id = %s", (staff.id,))
        return _profile(conn, staff.id)


@app.get("/overview")
def overview(staff: StaffDep):
    """Counts for the dashboard and the onboarding checklist."""
    with pool.connection() as conn:
        return conn.execute(
            """
            SELECT
              (SELECT count(*) FROM classes) AS classes,
              (SELECT count(*) FROM users) AS students,
              (SELECT count(DISTINCT user_id) FROM face_embeddings) AS students_with_face,
              (SELECT count(*) FROM sessions) AS sessions,
              (SELECT count(*) FROM sessions WHERE created_by = %(me)s) AS my_sessions,
              (SELECT count(*) FROM sessions WHERE start_time::date = current_date) AS sessions_today,
              (SELECT count(*) FROM attendance a JOIN sessions s ON s.id = a.session_id
                 WHERE s.created_by = %(me)s) AS my_marks,
              (SELECT count(*) FROM attendance WHERE marked_at::date = current_date) AS marked_today,
              (SELECT count(*) FROM staff WHERE role = 'teacher' AND approved) AS teachers,
              (SELECT count(*) FROM staff WHERE NOT approved) AS pending_staff
            """,
            {"me": staff.id},
        ).fetchone()


class StaffIn(BaseModel):
    email: str
    name: str
    role: Literal["admin", "teacher"]
    password: str | None = Field(None, min_length=8)  # omitted: generate a temporary one


@app.get("/staff")
def list_staff(_: AdminDep):
    with pool.connection() as conn:
        return conn.execute(
            "SELECT id, email, name, role, created_at, must_change_password, approved,"
            " onboarded_at IS NOT NULL AS onboarded FROM staff ORDER BY approved, name"
        ).fetchall()


@app.post("/staff", status_code=201)
def create_staff(body: StaffIn, _: AdminDep):
    password = body.password or secrets.token_urlsafe(9)
    with pool.connection() as conn:
        try:
            row = conn.execute(
                "INSERT INTO staff (email, name, role, password_hash, must_change_password)"
                " VALUES (%s, %s, %s, %s, true) RETURNING id, email, name, role",
                (body.email.strip().lower(), body.name, body.role, hash_password(password)),
            ).fetchone()
            return row | {"temporary_password": password}
        except psycopg.errors.UniqueViolation:
            raise HTTPException(409, "A staff account with that email already exists")


@app.post("/staff/{staff_id}/approve")
def approve_staff(staff_id: int, _: AdminDep):
    with pool.connection() as conn:
        if not conn.execute("UPDATE staff SET approved = true WHERE id = %s RETURNING id", (staff_id,)).fetchone():
            raise HTTPException(404, "Staff member not found")
    return {"approved": True}


@app.delete("/staff/{staff_id}", status_code=204)
def remove_staff(staff_id: int, admin: AdminDep):
    """Reject a sign-up request or remove an account. Sessions they created are kept."""
    if staff_id == admin.id:
        raise HTTPException(400, "You can't remove your own account")
    with pool.connection() as conn, conn.transaction():
        conn.execute("UPDATE sessions SET created_by = NULL WHERE created_by = %s", (staff_id,))
        conn.execute("UPDATE attendance SET marked_by = NULL WHERE marked_by = %s", (staff_id,))
        conn.execute("DELETE FROM staff WHERE id = %s", (staff_id,))


@app.post("/staff/{staff_id}/reset-password")
def reset_staff_password(staff_id: int, admin: AdminDep):
    if staff_id == admin.id:
        raise HTTPException(400, "Use Account settings to change your own password")
    temp = secrets.token_urlsafe(9)
    with pool.connection() as conn:
        row = conn.execute(
            "UPDATE staff SET password_hash = %s, must_change_password = true WHERE id = %s RETURNING email",
            (hash_password(temp), staff_id),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Staff member not found")
    return {"email": row["email"], "temporary_password": temp}


# ---------------------------------------------------------------- classes


class ClassIn(BaseModel):
    name: str = Field(min_length=1)


@app.get("/classes")
def list_classes(_: StaffDep):
    with pool.connection() as conn:
        return conn.execute(
            "SELECT c.id, c.name, count(u.id) AS students FROM classes c"
            " LEFT JOIN users u ON u.class_id = c.id GROUP BY c.id ORDER BY c.name"
        ).fetchall()


@app.post("/classes", status_code=201)
def create_class(body: ClassIn, _: AdminDep):
    with pool.connection() as conn:
        try:
            return conn.execute(
                "INSERT INTO classes (name) VALUES (%s) RETURNING id, name", (body.name.strip(),)
            ).fetchone()
        except psycopg.errors.UniqueViolation:
            raise HTTPException(409, "Class already exists")


# ---------------------------------------------------------------- enrollment


class EnrollStartIn(BaseModel):
    name: str = Field(min_length=1)
    roll_no: str = Field(min_length=1)
    class_id: int
    consent: bool
    user_id: int | None = None  # set to re-enroll an existing student


@app.post("/enroll/start")
def enroll_start(body: EnrollStartIn, staff: StaffDep):
    if not body.consent:
        raise HTTPException(400, "Explicit consent is required to enroll face data")
    with pool.connection() as conn:
        if not conn.execute("SELECT 1 FROM classes WHERE id = %s", (body.class_id,)).fetchone():
            raise HTTPException(404, "Class not found")
        clash = conn.execute(
            "SELECT id FROM users WHERE class_id = %s AND roll_no = %s",
            (body.class_id, body.roll_no.strip()),
        ).fetchone()
        if clash and clash["id"] != body.user_id:
            raise HTTPException(409, "That roll number is already enrolled in this class")
        if body.user_id and not conn.execute(
            "SELECT 1 FROM users WHERE id = %s", (body.user_id,)
        ).fetchone():
            raise HTTPException(404, "Student not found")
    draft = enrollment.create_draft(
        name=body.name.strip(),
        roll_no=body.roll_no.strip(),
        class_id=body.class_id,
        consent_version=CONSENT_VERSION,
        created_by=staff.id,
        reenroll_user_id=body.user_id,
    )
    return {"draft_id": draft.id, "required": settings.frames_required, "max_per_pose": settings.frames_per_pose_max}


@app.post("/enroll/frame")
def enroll_frame(
    _: StaffDep,
    draft_id: str = Form(),
    pose: Literal["front", "left", "right", "up", "down"] = Form(),
    image: UploadFile = File(),
):
    draft = enrollment.get_draft(draft_id)
    if draft is None:
        raise HTTPException(404, "Enrollment expired, start again")
    img = read_image(image)
    result = analyze(img)
    resp = {"accepted": False, "status": result.status, "issues": result.issues, "counts": draft.counts()}
    if result.face is not None:
        resp |= {"quality": result.face.quality, "yaw": round(result.face.yaw, 3), "pitch": round(result.face.pitch, 3)}
    if result.status != "ok":
        return resp

    obs = result.face
    for problem in (enrollment.check_pose(draft, pose, obs), enrollment.check_same_person(draft, pose, obs)):
        if problem:
            resp["issues"] = [problem]
            return resp
    if len(draft.frames[pose]) >= settings.frames_per_pose_max:
        resp["issues"] = ["Enough frames for this pose"]
        return resp

    draft.frames[pose].append(obs)
    resp |= {"accepted": True, "counts": draft.counts(), "missing": draft.missing()}
    return resp


class EnrollCompleteIn(BaseModel):
    draft_id: str


@app.post("/enroll/complete")
def enroll_complete(body: EnrollCompleteIn, _: StaffDep):
    draft = enrollment.get_draft(body.draft_id)
    if draft is None:
        raise HTTPException(404, "Enrollment expired, start again")
    if missing := draft.missing():
        raise HTTPException(400, {"message": "Not enough frames captured", "missing": missing})

    with pool.connection() as conn:
        # Duplicate check: the same face must not already belong to someone else.
        for obs in draft.frames["front"]:
            for user_id, sim in rank_users(conn, obs.embedding)[:1]:
                if user_id != draft.reenroll_user_id and sim >= settings.duplicate_threshold:
                    dup = conn.execute(
                        "SELECT u.name, u.roll_no, c.name AS class_name FROM users u"
                        " JOIN classes c ON c.id = u.class_id WHERE u.id = %s",
                        (user_id,),
                    ).fetchone()
                    raise HTTPException(
                        409,
                        f"This face is already enrolled as {dup['name']} "
                        f"({dup['roll_no']}, {dup['class_name']}). Use re-enroll instead.",
                    )

        with conn.transaction():
            if draft.reenroll_user_id:
                user_id = draft.reenroll_user_id
                conn.execute("DELETE FROM face_embeddings WHERE user_id = %s", (user_id,))
                conn.execute(
                    "UPDATE users SET name = %s, roll_no = %s, class_id = %s, consent_at = %s,"
                    " consent_version = %s, face_deleted_at = NULL WHERE id = %s",
                    (draft.name, draft.roll_no, draft.class_id, draft.consent_at, draft.consent_version, user_id),
                )
            else:
                try:
                    user_id = conn.execute(
                        "INSERT INTO users (name, roll_no, class_id, consent_at, consent_version)"
                        " VALUES (%s, %s, %s, %s, %s) RETURNING id",
                        (draft.name, draft.roll_no, draft.class_id, draft.consent_at, draft.consent_version),
                    ).fetchone()["id"]
                except psycopg.errors.UniqueViolation:
                    raise HTTPException(409, "That roll number is already enrolled in this class")
            # One row per frame, per pose: averaging would blur the profile views.
            with conn.cursor() as cur:
                cur.executemany(
                    "INSERT INTO face_embeddings (user_id, pose, embedding, quality_score) VALUES (%s, %s, %s, %s)",
                    [(user_id, pose, o.embedding, o.quality) for pose, obs_list in draft.frames.items() for o in obs_list],
                )
    enrollment.drop_draft(draft.id)
    return {"user_id": user_id, "embeddings": sum(draft.counts().values())}


@app.delete("/enroll/{draft_id}", status_code=204)
def enroll_cancel(draft_id: str, _: StaffDep):
    enrollment.drop_draft(draft_id)


# ---------------------------------------------------------------- students


@app.get("/users")
def list_users(_: StaffDep, class_id: int | None = None):
    with pool.connection() as conn:
        rows = conn.execute(
            """
            SELECT u.id, u.name, u.roll_no, u.class_id, c.name AS class_name, u.consent_at,
                   u.face_deleted_at, u.created_at,
                   (SELECT count(*) FROM face_embeddings fe WHERE fe.user_id = u.id) AS embeddings,
                   rc.avg_conf AS recent_confidence, rc.n AS recent_marks
            FROM users u
            JOIN classes c ON c.id = u.class_id
            LEFT JOIN LATERAL (
                SELECT avg(confidence) AS avg_conf, count(*) AS n FROM (
                    SELECT confidence FROM attendance a
                    WHERE a.user_id = u.id AND a.method = 'face'
                    ORDER BY marked_at DESC LIMIT %(w)s
                ) t
            ) rc ON true
            WHERE %(class_id)s::int IS NULL OR u.class_id = %(class_id)s
            ORDER BY c.name, u.roll_no
            """,
            {"w": settings.reenroll_window, "class_id": class_id},
        ).fetchall()
    for r in rows:
        conf = r["recent_confidence"]
        r["needs_reenroll"] = (
            r["face_deleted_at"] is None
            and r["recent_marks"] >= 3
            and conf is not None
            and conf < settings.reenroll_confidence
        )
    return rows


@app.delete("/users/{user_id}/face-data")
def delete_face_data(user_id: int, _: AdminDep):
    """Right to erasure: remove biometric data but keep attendance history."""
    with pool.connection() as conn:
        n = conn.execute("DELETE FROM face_embeddings WHERE user_id = %s", (user_id,)).rowcount
        if not conn.execute(
            "UPDATE users SET face_deleted_at = now() WHERE id = %s RETURNING id", (user_id,)
        ).fetchone():
            raise HTTPException(404, "Student not found")
    return {"deleted_embeddings": n}


@app.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, _: AdminDep):
    with pool.connection() as conn:
        conn.execute("DELETE FROM users WHERE id = %s", (user_id,))


# ---------------------------------------------------------------- sessions


class SessionIn(BaseModel):
    class_id: int
    subject: str = Field(min_length=1)
    start_time: datetime
    end_time: datetime


SESSION_COLS = """
    s.id, s.class_id, c.name AS class_name, s.subject, s.start_time, s.end_time,
    (SELECT count(*) FROM attendance a WHERE a.session_id = s.id) AS present,
    (SELECT count(*) FROM users u WHERE u.class_id = s.class_id) AS total
"""


@app.post("/sessions", status_code=201)
def create_session(body: SessionIn, staff: StaffDep):
    if body.end_time <= body.start_time:
        raise HTTPException(400, "End time must be after start time")
    with pool.connection() as conn:
        sid = conn.execute(
            "INSERT INTO sessions (class_id, subject, start_time, end_time, created_by)"
            " VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (body.class_id, body.subject.strip(), body.start_time, body.end_time, staff.id),
        ).fetchone()["id"]
        return conn.execute(
            f"SELECT {SESSION_COLS} FROM sessions s JOIN classes c ON c.id = s.class_id WHERE s.id = %s", (sid,)
        ).fetchone()


@app.get("/sessions")
def list_sessions(_: StaffDep, class_id: int | None = None, limit: int = 50):
    with pool.connection() as conn:
        return conn.execute(
            f"SELECT {SESSION_COLS} FROM sessions s JOIN classes c ON c.id = s.class_id"
            " WHERE %(class_id)s::int IS NULL OR s.class_id = %(class_id)s"
            " ORDER BY s.start_time DESC LIMIT %(limit)s",
            {"class_id": class_id, "limit": min(limit, 500)},
        ).fetchall()


def _get_session(conn, session_id: int):
    row = conn.execute(
        f"SELECT {SESSION_COLS} FROM sessions s JOIN classes c ON c.id = s.class_id WHERE s.id = %s",
        (session_id,),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Session not found")
    return row


@app.get("/sessions/{session_id}")
def get_session(session_id: int, _: StaffDep):
    with pool.connection() as conn:
        return _get_session(conn, session_id)


@app.get("/sessions/{session_id}/attendance")
def session_attendance(session_id: int, _: StaffDep):
    with pool.connection() as conn:
        session = _get_session(conn, session_id)
        roster = conn.execute(
            """
            SELECT u.id AS user_id, u.name, u.roll_no, a.marked_at, a.confidence, a.method,
                   (u.face_deleted_at IS NULL AND EXISTS (
                       SELECT 1 FROM face_embeddings fe WHERE fe.user_id = u.id)) AS face_enrolled
            FROM users u
            LEFT JOIN attendance a ON a.user_id = u.id AND a.session_id = %s
            WHERE u.class_id = %s
            ORDER BY u.roll_no
            """,
            (session_id, session["class_id"]),
        ).fetchall()
    return {"session": session, "roster": roster}


class ManualMarkIn(BaseModel):
    user_id: int


@app.post("/sessions/{session_id}/attendance/manual")
def manual_mark(session_id: int, body: ManualMarkIn, staff: StaffDep):
    with pool.connection() as conn:
        session = _get_session(conn, session_id)
        user = conn.execute("SELECT class_id FROM users WHERE id = %s", (body.user_id,)).fetchone()
        if not user or user["class_id"] != session["class_id"]:
            raise HTTPException(400, "Student is not in this class")
        row = conn.execute(
            "INSERT INTO attendance (user_id, session_id, method, marked_by) VALUES (%s, %s, 'manual', %s)"
            " ON CONFLICT (user_id, session_id) DO NOTHING RETURNING id",
            (body.user_id, session_id, staff.id),
        ).fetchone()
    return {"status": "marked" if row else "already_marked"}


@app.delete("/sessions/{session_id}/attendance/{user_id}", status_code=204)
def unmark(session_id: int, user_id: int, _: StaffDep):
    with pool.connection() as conn:
        conn.execute("DELETE FROM attendance WHERE session_id = %s AND user_id = %s", (session_id, user_id))


# ---------------------------------------------------------------- recognition


@app.post("/recognize")
def recognize(
    _: StaffDep,
    session_id: int = Form(),
    attempt_id: str | None = Form(None),
    image: UploadFile = File(),
):
    img = read_image(image)
    with pool.connection() as conn:
        session = _get_session(conn, session_id)
        now = datetime.now(timezone.utc)
        grace = timedelta(minutes=settings.session_grace_min)
        if not (session["start_time"] - grace <= now <= session["end_time"] + grace):
            raise HTTPException(409, "This session is not open for attendance right now")

        result = analyze(img)
        if result.status != "ok":
            if result.face is not None:
                _log(conn, session_id, result.status, None, None, None, result.face)
            return {"status": result.status, "issues": result.issues, "attempt_id": attempt_id}

        obs = result.face
        m = match(conn, obs.embedding)
        if not m.accepted:
            _log(conn, session_id, "unknown", m.user_id, m.top1, m.top2, obs)
            return {"status": "unknown", "attempt_id": attempt_id}

        user = conn.execute("SELECT id, name, roll_no, class_id FROM users WHERE id = %s", (m.user_id,)).fetchone()
        if user["class_id"] != session["class_id"]:
            _log(conn, session_id, "wrong_class", m.user_id, m.top1, m.top2, obs)
            return {"status": "wrong_class", "attempt_id": attempt_id}

        attempt = recognition.get_or_create(attempt_id, session_id)
        attempt.observe(user["id"], m.top1, obs)
        if not attempt.complete:
            _log(conn, session_id, "verifying", m.user_id, m.top1, m.top2, obs)
            return {
                "status": "verifying",
                "attempt_id": attempt.id,
                "challenge": attempt.challenge,
                "prompt": attempt.prompt(),
                "progress": min(attempt.streak, settings.stable_frames) / settings.stable_frames,
            }

        recognition.finish(attempt.id)
        confidence = round(mean(attempt.sims), 4)
        row = conn.execute(
            "INSERT INTO attendance (user_id, session_id, confidence, method) VALUES (%s, %s, %s, 'face')"
            " ON CONFLICT (user_id, session_id) DO NOTHING RETURNING marked_at",
            (user["id"], session_id, confidence),
        ).fetchone()
        _log(conn, session_id, "marked" if row else "already_marked", m.user_id, m.top1, m.top2, obs)
        return {
            "status": "marked" if row else "already_marked",
            "user": {"id": user["id"], "name": user["name"], "roll_no": user["roll_no"]},
            "confidence": confidence,
        }


def _log(conn, session_id, status, user_id, top1, top2, obs) -> None:
    conn.execute(
        "INSERT INTO recognition_log (session_id, status, top1_user, top1_sim, top2_sim, det_score, blur)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (session_id, status, user_id, top1, top2, obs.det_score, obs.blur),
    )


# ---------------------------------------------------------------- reports


@app.get("/reports")
def report(
    _: StaffDep,
    class_id: int,
    from_: date | None = Query(None, alias="from"),
    to: date | None = None,
    format: Literal["json", "csv"] = "json",
):
    start = datetime.combine(from_ or date(1970, 1, 1), datetime.min.time(), timezone.utc)
    end = datetime.combine((to or date(2999, 12, 30)) + timedelta(days=1), datetime.min.time(), timezone.utc)
    with pool.connection() as conn:
        rows = conn.execute(
            """
            WITH s AS (
                SELECT id FROM sessions
                WHERE class_id = %(c)s AND start_time >= %(start)s AND start_time < %(end)s
            )
            SELECT u.id AS user_id, u.name, u.roll_no,
                   count(a.id) AS attended,
                   (SELECT count(*) FROM s) AS total
            FROM users u
            LEFT JOIN attendance a ON a.user_id = u.id AND a.session_id IN (SELECT id FROM s)
            WHERE u.class_id = %(c)s
            GROUP BY u.id
            ORDER BY u.roll_no
            """,
            {"c": class_id, "start": start, "end": end},
        ).fetchall()
    for r in rows:
        r["percentage"] = round(100 * r["attended"] / r["total"], 1) if r["total"] else None

    if format == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["Roll No", "Name", "Attended", "Total Sessions", "Percentage"])
        for r in rows:
            writer.writerow([r["roll_no"], r["name"], r["attended"], r["total"], r["percentage"] if r["percentage"] is not None else ""])
        return Response(
            buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="attendance-class{class_id}.csv"'},
        )
    return {"total_sessions": rows[0]["total"] if rows else 0, "rows": rows}
