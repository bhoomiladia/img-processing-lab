CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS staff (
    id            serial PRIMARY KEY,
    email         text UNIQUE NOT NULL,
    name          text NOT NULL,
    role          text NOT NULL CHECK (role IN ('admin', 'teacher')),
    password_hash text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS classes (
    id         serial PRIMARY KEY,
    name       text UNIQUE NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id              serial PRIMARY KEY,
    name            text NOT NULL,
    roll_no         text NOT NULL,
    class_id        int NOT NULL REFERENCES classes(id),
    consent_at      timestamptz NOT NULL,
    consent_version text NOT NULL,
    face_deleted_at timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (class_id, roll_no)
);

CREATE TABLE IF NOT EXISTS face_embeddings (
    id            bigserial PRIMARY KEY,
    user_id       int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pose          text NOT NULL CHECK (pose IN ('front', 'left', 'right', 'up', 'down')),
    embedding     vector(512) NOT NULL,
    quality_score real NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS face_embeddings_user_idx ON face_embeddings (user_id);
CREATE INDEX IF NOT EXISTS face_embeddings_hnsw_idx
    ON face_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS sessions (
    id         serial PRIMARY KEY,
    class_id   int NOT NULL REFERENCES classes(id),
    subject    text NOT NULL,
    start_time timestamptz NOT NULL,
    end_time   timestamptz NOT NULL CHECK (end_time > start_time),
    created_by int REFERENCES staff(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance (
    id         bigserial PRIMARY KEY,
    user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id int NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    marked_at  timestamptz NOT NULL DEFAULT now(),
    confidence real,
    method     text NOT NULL CHECK (method IN ('face', 'manual')),
    marked_by  int REFERENCES staff(id),
    UNIQUE (user_id, session_id)
);

-- Scores only, never images: used to pick the match threshold from real data.
CREATE TABLE IF NOT EXISTS recognition_log (
    id         bigserial PRIMARY KEY,
    session_id int REFERENCES sessions(id) ON DELETE CASCADE,
    at         timestamptz NOT NULL DEFAULT now(),
    status     text NOT NULL,
    top1_user  int REFERENCES users(id) ON DELETE SET NULL,
    top1_sim   real,
    top2_sim   real,
    det_score  real,
    blur       real
);

-- Onboarding: accounts created by an admin get a temporary password to replace on first login.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

-- Self sign-up: teacher accounts created from /signup wait for an admin's approval.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT true;
