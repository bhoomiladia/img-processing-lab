# Presently

Face attendance for classrooms: multi-angle face enrollment and liveness-checked attendance.

```
web/         Next.js + TypeScript: enrollment UI, attendance kiosk, admin dashboard
             MediaPipe Face Landmarker runs in the browser for live head-pose guidance
ml-service/  FastAPI (Python 3.11): InsightFace buffalo_l (RetinaFace + ArcFace),
             quality gate, liveness challenge, pgvector matching, and the REST API
docker-compose.yml   Postgres 16 + pgvector
```

For production (HTTPS, Docker, backups) see **[DEPLOY.md](DEPLOY.md)**.

## Run it

```bash
# 1. Database
docker compose up -d

# 2. ML / API service (downloads the ~280 MB buffalo_l model on first start)
cd ml-service
cp .env.example .env            # then set JWT_SECRET to a long random string
uv sync
uv run python -m app.cli create-staff --email you@college.in --name "Your Name" --role admin
uv run uvicorn app.main:app --port 8000

# 3. Web app
cd ../web
cp .env.local.example .env.local
npm install
npm run dev                     # http://localhost:3000
```

Browsers only allow the webcam on `https://` or `localhost`. For a kiosk on another
device on the LAN, run `npm run dev:https` or put both services behind a TLS reverse proxy
(e.g. Caddy), and set `NEXT_PUBLIC_API_URL` and `CORS_ORIGINS` to the HTTPS origins.

## How it works

**Enrollment** (`/enroll`): details and explicit consent, then a guided scan: front → left →
right → up → down. The browser auto-captures when the head is in the target zone and
still. The server rejects frames that are blurry, too dark or bright, too small, have more
than one face, don't match the claimed pose, or don't match the person's earlier frames.
About 20 embeddings are stored **per pose, not averaged**. Before saving, a duplicate check
makes sure the face isn't already enrolled under another name. No photos are stored.

**Attendance** (`/kiosk/:sessionId`): the kiosk sends a frame every ~400 ms while a face
is visible. A person is marked only when:

1. the best match is ≥ `MATCH_THRESHOLD` **and** beats the runner-up by ≥ `MATCH_MARGIN`,
2. the same identity holds for `STABLE_FRAMES` (3) consecutive frames, and
3. within that streak the server saw a frontal baseline followed by a **random head-movement
   challenge** (turn left, turn right, or look up), verified server-side from the face
   keypoints. A held-up photo can't do this.

`UNIQUE(user_id, session_id)` prevents double marking. Unknown faces get a "Not recognized"
banner with a teacher manual-mark fallback.

**Teacher onboarding**: teachers can **sign up** at `/signup` and wait for admin approval
(the very first sign-up on a fresh install becomes the admin), or admins invite them from **Staff**. Presently generates a
temporary password and a ready-to-send message. On first sign-in the teacher sets their own
password, takes a short tour, runs a camera and lighting check on the kiosk device, and gets
a setup checklist (class → enroll students → schedule a session → take attendance) that
stays on their home page and ticks itself off. Anyone can replay the tour from **Account**.

**Dashboard**: create classes and sessions, view the roster (manual mark and undo),
manage students (re-enroll, delete face data), reports with percentages and CSV export
(opens in Excel), and staff accounts (admin only).

## Tuning (do this with real data from your classroom)

Every recognition attempt's scores (never images) are written to `recognition_log`. After
enrolling a few students and running some sessions:

```bash
cd ml-service && uv run python scripts/calibrate.py
```

It prints genuine vs. impostor similarity distributions and suggests a threshold. Set
`MATCH_THRESHOLD` / `MATCH_MARGIN` in `.env`. All other knobs (blur, brightness, pose
deltas, session grace window, re-enroll trigger) are in `ml-service/app/config.py` and can
be overridden through environment variables.

Students whose recent match confidence keeps falling (new glasses, beard and so on) get a
**re-enroll** badge on the Students page.

## Privacy (DPDP Act)

- Explicit consent is required and recorded (`consent_at`, `consent_version`) before any capture.
- Only 512-d embeddings are stored. No face images are kept anywhere.
- Admins can **Delete face data** (erases embeddings, keeps attendance history) or remove a student.
- Every endpoint except login requires a staff token. Deletion and staff management are admin-only.
- In production: enable encryption at rest on the Postgres volume/disk, use TLS, and set a strong `JWT_SECRET`.

## Known limits

- The head-turn challenge stops photos, but not someone replaying a video of a person who
  happens to perform the right movement. For stronger anti-spoofing, add a passive model
  (e.g. Silent-Face-Anti-Spoofing / MiniFASNet) as another gate in `/recognize`.
- Enrollment drafts and liveness attempts live in process memory, so run the API as a
  **single worker** (the default), or move that state to Redis before scaling out.
- The kiosk is one person at a time by design. Whole-class photo capture is a possible extension.
