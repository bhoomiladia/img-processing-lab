# Deploying Presently

Three options:
- **[Render](#option-a-render)**: managed hosting. No server to look after, deploys on every `git push`.
- **[Your own server](#option-b-your-own-server)**: one Linux VM with Docker. Cheaper at scale, full control.
- **[Free tier](#option-c-free-tier-cloud-run--neon--vercel)**: Google Cloud Run + Neon + Vercel. $0 within their free allowances.

---

## Option A: Render

[`render.yaml`](render.yaml) is a Render Blueprint. It creates everything in one region (Singapore, the closest to India):

| Resource | Render plan | Why |
|---|---|---|
| `presently-db` | Postgres `basic-256mb` | pgvector is enabled automatically on first start. Daily backups included |
| `presently-api` | Web service, **Standard (2 GB)** | the face model needs ~1.5 GB RAM. Free/Starter (512 MB) run out of memory |
| `presently-web` | Web service, Starter | the Next.js app. Forwards `/api` to the API over Render's private network |

Check current prices at render.com/pricing. Don't use the free plan for the API: besides the
memory limit, free services sleep when idle, so the first student of the day would wait a minute.

### Steps

1. **Push the code to GitHub** (private repo):
   ```bash
   cd ~/my-projects/img-processing-lab
   git init && git add . && git commit -m "Presently"
   git remote add origin git@github.com:<you>/presently.git && git push -u origin main
   ```
2. In the Render dashboard: **New → Blueprint** → connect GitHub → pick the repo → **Apply**.
   Render reads `render.yaml`, creates the database and both services, and generates `JWT_SECRET`.
3. **Wait for the first deploy** (~10 minutes: the API image compiles InsightFace and bakes in the face model).
   Both services should show **Live**.
4. Open the **presently-web** URL (e.g. `https://presently-web.onrender.com`). It's HTTPS already, so the camera works.
   Click **Create the admin account**: the first sign-up becomes the admin.
5. Add teachers: they sign up at `/signup` and you approve them on **Staff**, or you invite them from **Staff**.

### Custom domain (optional)

On **presently-web → Settings → Custom Domains**, add `attendance.yourcollege.edu`, then create the
CNAME record Render shows you at your DNS provider. Render issues the HTTPS certificate.

### Running on Render

| Task | How |
|---|---|
| Deploy an update | `git push`: Render rebuilds and deploys automatically |
| Logs | Service → **Logs** |
| Turn off public sign-up | presently-api → **Environment** → `ALLOW_SIGNUP=false` → Save |
| Tune the match threshold | presently-api → **Shell** → `python scripts/calibrate.py`, then set `MATCH_THRESHOLD` in **Environment** |
| Backups / restore | presently-db → **Recovery** (point-in-time) or **Backups** |
| Create an admin from the shell | presently-api → **Shell** → `python -m app.cli create-staff --email you@college.edu --name "Your Name" --role admin` |

Keep **presently-api at 1 instance** (don't enable scaling): in-progress enrollments and liveness
checks live in its memory. Scale up the plan instead if it gets slow.

If the web app shows *"API_INTERNAL_URL is not configured"* or *"service is starting up"*: wait for
presently-api to be Live. If it persists, set `API_INTERNAL_URL` on presently-web to the API's
public URL (e.g. `https://presently-api.onrender.com`).

---

## Option B: Your own server

Everything runs on one Linux server with Docker: Postgres + pgvector, the face/ML API, the
Next.js web app, and Caddy, which gets a free HTTPS certificate automatically. Browsers only
allow webcam access over HTTPS, so a real domain is required.

```
Browser ──HTTPS──> Caddy :443 ──/api/*──> api (FastAPI + InsightFace, port 8000)
                              └─/*─────> web (Next.js, port 3000)
                   db (Postgres + pgvector): internal only, never exposed
```

### 1. Get a server

| | Minimum | Comfortable (500+ students, several kiosks) |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 30 GB SSD | 50 GB SSD |

- Ubuntu 24.04 LTS. No GPU needed: recognition takes ~70 ms per frame on CPU.
- Face data is biometric personal data under the DPDP Act, so pick an **India region**
  (AWS Mumbai `ap-south-1`, DigitalOcean Bangalore, Azure Central India) or a college-owned server.
- In the provider's firewall, open **22** (SSH), **80** and **443** (TCP + UDP). Nothing else.

### 2. Point a domain at it

Create a DNS **A record**, e.g. `attendance.yourcollege.edu → <server IP>`.
Check it with `ping attendance.yourcollege.edu` before continuing; Caddy needs it to issue the certificate.

### 3. Install Docker on the server

```bash
ssh ubuntu@<server IP>
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && exit      # log out and back in so the group applies
```

### 4. Copy the code to the server

Using a **private** Git repository (recommended, makes updates easy):

```bash
# on your Mac, once
cd ~/my-projects/img-processing-lab
git init && git add . && git commit -m "Presently"
git remote add origin git@github.com:<you>/presently.git && git push -u origin main

# on the server
sudo mkdir -p /opt/presently && sudo chown $USER /opt/presently
git clone git@github.com:<you>/presently.git /opt/presently
```

Or without Git: `rsync -av --exclude node_modules --exclude .venv --exclude .next ~/my-projects/img-processing-lab/ ubuntu@<server IP>:/opt/presently/`

### 5. Configure secrets

```bash
cd /opt/presently
cp .env.prod.example .env.prod
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 32)/" .env.prod
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env.prod
nano .env.prod      # set DOMAIN=attendance.yourcollege.edu
chmod 600 .env.prod
```

Never commit `.env.prod` (it's in `.gitignore`). If `POSTGRES_PASSWORD` is lost, the database can't be opened.

### 6. Start it

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

The first build takes ~5–10 minutes (it compiles InsightFace and bakes the 280 MB face model
into the image). Check that it's up:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps     # all "Up", api "healthy"
curl https://attendance.yourcollege.edu/api/health                     # {"ok":true}
```

### 7. Create the admin account

Open `https://attendance.yourcollege.edu`. On a fresh install the sign-in page offers
**Create the admin account**. The first sign-up becomes the admin and goes straight into the onboarding tour.

Then add teachers either way:
- **Invite** from *Staff* (you share a generated temporary password), or
- teachers **sign up** at `/signup` and you **Approve** them on *Staff* (the Home page shows pending requests).

To allow invites only, set `ALLOW_SIGNUP=false` in `.env.prod` and re-run the `up -d` command.

### 8. Set up nightly backups

```bash
chmod +x /opt/presently/deploy/backup.sh
(crontab -l 2>/dev/null; echo "30 2 * * * /opt/presently/deploy/backup.sh") | crontab -
```

Dumps go to `/opt/presently/backups/` and are kept 14 days. Copy them off the server too
(e.g. the provider's volume snapshots or `rclone` to cloud storage).

To restore a dump:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  pg_restore -U attendance -d attendance --clean --if-exists < backups/presently-YYYY-MM-DD.dump
```

### 9. Set up the classroom kiosks

Any laptop or tablet with a webcam and Chrome/Edge/Safari:
1. Open `https://attendance.yourcollege.edu`, sign in, and allow camera access.
2. Run **Account → Replay the onboarding tour → camera check** to confirm lighting and distance.
3. Camera at eye level, light on students' faces, no bright window behind them.

The kiosk needs internet access (the face tracker loads from a CDN).

### Day-to-day operations

| Task | Command (in `/opt/presently`) |
|---|---|
| Deploy an update | `git pull && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build` |
| View logs | `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api` |
| Restart | `docker compose -f docker-compose.prod.yml --env-file .env.prod restart` |
| Tune the match threshold (after a week of use) | `docker compose -f docker-compose.prod.yml --env-file .env.prod exec api python scripts/calibrate.py`, then set `MATCH_THRESHOLD` in `.env.prod` and `up -d` |
| Create an admin from the shell | `docker compose -f docker-compose.prod.yml --env-file .env.prod exec api python -m app.cli create-staff --email you@college.edu --name "Your Name" --role admin` |

Schema changes apply automatically when the api container starts. Keep the API at **one
worker** (as configured): in-progress enrollments and liveness checks live in its memory.

### Moving your local data to the server (optional)

```bash
# on your Mac
docker compose exec -T db pg_dump -U attendance -Fc attendance > local.dump
scp local.dump ubuntu@<server IP>:/opt/presently/
# on the server
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  pg_restore -U attendance -d attendance --clean --if-exists < local.dump
```

---

## Option C: Free tier (Cloud Run + Neon + Vercel)

| Piece | Service | Free allowance (check current pages) |
|---|---|---|
| Face/API service | **Google Cloud Run** | ~180,000 vCPU-s, 360,000 GiB-s and 2M requests per month (request-based billing). Needs a billing account (card), but stays at $0 within the allowance |
| Database | **Neon** Postgres | 0.5 GB storage and 100 CU-hours per project per month. pgvector included. Sleeps after 5 min idle |
| Website | **Vercel** Hobby | Free for personal, non-commercial projects |

Why not other free hosts: free Docker Spaces on Hugging Face now need a paid plan, and the
512 MB / 0.1 CPU free tiers (Render, Koyeb) took 13–35 s per frame in testing.

**Rough capacity on the free allowance:** one check-in is ~6 frames at ~0.2–0.3 s each. 500 students ×
4 sessions/day × 22 days fits inside Cloud Run's free vCPU and memory seconds. Set a budget alert
in case usage grows. Container images in Artifact Registry may cost a few cents per month beyond its free 0.5 GB.

### 1. Database: Neon

1. Sign up at neon.com and create a project (region: pick the one closest to your Cloud Run region, e.g. AWS US East for `us-central1`).
2. **Connect** → choose the **direct** connection (not "Pooled"), copy the string. It looks like
   `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`.
3. Optional: in the compute settings, keep the max size at **0.25 CU** so the free CU-hours last.

Tables and the pgvector extension are created automatically when the API first starts.

### 2. Face/API service: Cloud Run

Install the gcloud CLI (`brew install --cask google-cloud-sdk`), then:

```bash
gcloud auth login
gcloud projects create presently-<something-unique> && gcloud config set project presently-<something-unique>
# Link a billing account in the console (Billing → Link), then:
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

cd ~/my-projects/img-processing-lab
gcloud run deploy presently-api --source ml-service --region us-central1 \
  --memory 2Gi --cpu 1 --min-instances 0 --max-instances 1 --cpu-boost \
  --allow-unauthenticated \
  --set-env-vars "DATABASE_URL=<neon direct connection string>,JWT_SECRET=$(openssl rand -hex 32),DB_POOL_MIN_SIZE=0,DB_POOL_MAX_IDLE_S=120,TIMEZONE=Asia/Kolkata"
```

- The first build takes ~10 minutes. The command prints the service URL, e.g. `https://presently-api-xxxx-uc.a.run.app`.
  Check it: `curl <URL>/health` → `{"ok":true}`.
- `--max-instances 1` is required: in-progress enrollments and liveness checks live in memory.
- `DB_POOL_MIN_SIZE=0` lets Neon sleep between classes so the free CU-hours last the month.
- The first request after a quiet period takes ~20–40 s while the container starts. Open the kiosk a minute before class.
- Billing → **Budgets & alerts**: create a ₹100 budget with email alerts.

### 3. Website: Vercel

1. Push the repo to GitHub (see Option A, step 1).
2. vercel.com → **Add New → Project** → import the repo → set **Root Directory** to `web`.
3. **Environment Variables**: `NEXT_PUBLIC_API_URL` = your Cloud Run URL (no trailing slash). Deploy.
4. Allow the website to call the API (put your Vercel URL in):
   ```bash
   gcloud run services update presently-api --region us-central1 \
     --update-env-vars 'CORS_ORIGINS=["https://presently.vercel.app"]'
   ```
5. Open the Vercel URL → **Create the admin account**.

### Updating

- Website: `git push` (Vercel redeploys automatically).
- API: re-run the `gcloud run deploy presently-api --source ml-service --region us-central1` command
  (existing env vars are kept).
- Hitting the free limits? Switch to the small face model: it needs ~350 MB instead of ~1.1 GB, runs ~6×
  faster, and is a little less accurate in poor light or at steep angles. Change the default in
  `ml-service/Dockerfile` to `ARG INSIGHTFACE_MODEL=buffalo_sc`, deploy with `--memory 1Gi`, and re-enroll
  everyone (templates from different models don't match).
