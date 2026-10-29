"use client";

import { ArrowRight, CheckCircle2, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { EnrollArt } from "@/components/Art";
import PosePad from "@/components/PosePad";
import { PageHeader } from "@/components/Shell";
import { api, errorMessage, type ClassRow, type EnrollFrameResult, type Pose } from "@/lib/api";
import { captureFrame, useCamera } from "@/lib/camera";
import { loadLandmarker, readPose, type PoseReading } from "@/lib/facePose";
import { useLoad } from "@/lib/useLoad";

const CONSENT_TEXT =
  "I consent to my face being captured and converted into numeric face templates (embeddings) for the sole purpose of " +
  "marking my class attendance. Photos are not stored. I can ask an administrator to delete my face data at any time; " +
  "my attendance history is kept separately.";

/** Yaw/pitch in degrees; pitch is relative to the person's own frontal baseline. */
const STEPS: { pose: Pose; prompt: string; target: [number, number, number, number]; arrow: string }[] = [
  { pose: "front", prompt: "Look straight at the camera", target: [-10, 10, -25, 25], arrow: "●" },
  { pose: "left", prompt: "Turn your head to your left", target: [22, 42, -15, 15], arrow: "←" },
  { pose: "right", prompt: "Turn your head to your right", target: [-42, -22, -15, 15], arrow: "→" },
  { pose: "up", prompt: "Tilt your head up", target: [-15, 15, 12, 30], arrow: "↑" },
  { pose: "down", prompt: "Tilt your head down", target: [-15, 15, -30, -12], arrow: "↓" },
];
const FRAMES_PER_POSE = 4;
const SEND_INTERVAL_MS = 400;
const STABLE_MS = 250;

type Details = { name: string; roll_no: string; class_id: string };

function EnrollInner() {
  const params = useSearchParams();
  const reenrollId = params.get("user_id");
  const classes = useLoad<ClassRow[]>("/classes");
  const [details, setDetails] = useState<Details>({
    name: params.get("name") ?? "",
    roll_no: params.get("roll_no") ?? "",
    class_id: params.get("class_id") ?? "",
  });
  const [consent, setConsent] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [done, setDone] = useState<{ embeddings: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<{ draft_id: string }>("/enroll/start", {
        json: { ...details, class_id: Number(details.class_id), consent, user_id: reenrollId ? Number(reenrollId) : null },
      });
      setDraftId(res.draft_id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function reset() {
    setDraftId(null);
    setDone(null);
    setConsent(false);
    setDetails({ name: "", roll_no: "", class_id: details.class_id });
  }

  if (done)
    return (
      <div className="card center" style={{ maxWidth: 520, margin: "2rem auto", padding: "2.5rem 1.5rem" }}>
        <div className="icon-tile tone-teal" style={{ width: 72, height: 72, borderRadius: "50%", margin: "0 auto 1rem" }}><CheckCircle2 size={38} /></div>
        <h1>{details.name} is enrolled</h1>
        <p className="muted" style={{ margin: "0.6rem 0 1.5rem" }}>{done.embeddings} face templates stored across 5 angles. No photos were saved.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="lg" onClick={reset}>Enroll next student <ArrowRight size={18} /></button>
          <Link className="btn secondary lg" href="/students">View students</Link>
        </div>
      </div>
    );

  if (draftId)
    return (
      <Capture
        draftId={draftId}
        name={details.name}
        onDone={setDone}
        onCancel={() => {
          api(`/enroll/${draftId}`, { method: "DELETE" }).catch(() => {});
          setDraftId(null);
        }}
      />
    );

  return (
    <>
      <PageHeader title={reenrollId ? "Re-enroll student" : "Enroll a student"} subtitle="Student details and consent first, then a 30-second guided face scan" />
      <div className="grid-2" style={{ alignItems: "start" }}>
        <form className="card" onSubmit={start}>
          {error && <div className="alert bad">{error}</div>}
          <div className="stack">
            <label>
              Full name
              <input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} required placeholder="e.g. Aarav Mehta" />
            </label>
            <div className="row">
              <label style={{ flex: 1 }}>
                Roll number
                <input value={details.roll_no} onChange={(e) => setDetails({ ...details, roll_no: e.target.value })} required placeholder="e.g. CSE21A042" />
              </label>
              <label style={{ flex: 1 }}>
                Class
                <select value={details.class_id} onChange={(e) => setDetails({ ...details, class_id: e.target.value })} required>
                  <option value="">Choose…</option>
                  {classes.data?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span>{CONSENT_TEXT}</span>
            </label>
            <button className="lg" disabled={!consent}>Continue to face scan <ArrowRight size={18} /></button>
          </div>
        </form>
        <div className="card" style={{ background: "linear-gradient(160deg, #efeaff, #ffffff)" }}>
          <div className="center"><EnrollArt size={200} /></div>
          <h3>What the student will do</h3>
          <ol className="small muted" style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.3rem" }}>
            <li>Look straight at the camera</li>
            <li>Turn their head left, then right</li>
            <li>Tilt their head up, then down</li>
          </ol>
          <p className="small muted" style={{ display: "flex", gap: "0.5rem", margin: 0 }}>
            <ShieldCheck size={18} color="var(--teal)" /> Capture is automatic. Only numeric templates are stored, never photos.
          </p>
        </div>
      </div>
    </>
  );
}

function Capture({
  draftId,
  name,
  onDone,
  onCancel,
}: {
  draftId: string;
  name: string;
  onDone: (r: { embeddings: number }) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useCamera(videoRef);
  const [stepIdx, setStepIdx] = useState(0);
  const [counts, setCounts] = useState<Record<Pose, number>>({ front: 0, left: 0, right: 0, up: 0, down: 0 });
  const [hint, setHint] = useState("Loading face tracker…");
  const [reading, setReading] = useState<PoseReading & { relPitch: number; good: boolean }>();
  const [serverIssue, setServerIssue] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loop = useRef({ stepIdx: 0, inFlight: false, lastSent: 0, stableSince: 0, prev: null as PoseReading | null, basePitch: [] as number[], lastUi: 0 });

  useEffect(() => {
    if (!camera.ready) return;
    let raf = 0;
    let stopped = false;
    loadLandmarker().then((lm) => {
      const tick = () => {
        if (stopped) return;
        const video = videoRef.current!;
        const s = loop.current;
        const now = performance.now();
        const step = STEPS[s.stepIdx];
        if (!step) return;
        const r = readPose(lm, video, now);
        const base = s.basePitch.length ? s.basePitch.reduce((a, b) => a + b) / s.basePitch.length : 0;
        const relPitch = step.pose === "front" ? r.pitch : r.pitch - base;
        const [y0, y1, p0, p1] = step.target;
        const inRange = r.faces === 1 && r.size > 0.15 && r.yaw >= y0 && r.yaw <= y1 && relPitch >= p0 && relPitch <= p1;
        const still = s.prev && Math.abs(r.yaw - s.prev.yaw) < 2.5 && Math.abs(r.pitch - s.prev.pitch) < 2.5;
        s.prev = r;
        if (!inRange || !still) s.stableSince = now;

        if (inRange && now - s.stableSince >= STABLE_MS && !s.inFlight && now - s.lastSent >= SEND_INTERVAL_MS) {
          s.inFlight = true;
          s.lastSent = now;
          const pitchAtCapture = r.pitch;
          sendFrame(step.pose, video)
            .then((res) => {
              if (!res) return;
              if (res.accepted) {
                setServerIssue(null);
                setCounts(res.counts);
                if (step.pose === "front") s.basePitch.push(pitchAtCapture);
                if (res.counts[step.pose] >= FRAMES_PER_POSE) advance();
              } else {
                setServerIssue(res.issues[0] ?? "Frame rejected, try again");
              }
            })
            .finally(() => (s.inFlight = false));
        }

        if (now - s.lastUi > 100) {
          s.lastUi = now;
          setReading({ ...r, relPitch, good: inRange });
          setHint(
            r.faces === 0 ? "Position your face in the oval"
            : r.faces > 1 ? "Only one person should be in view"
            : r.size <= 0.15 ? "Move closer to the camera"
            : inRange ? "Hold still…"
            : step.prompt,
          );
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => setError("Could not load the face tracker. Check your internet connection."));
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [camera.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendFrame(pose: Pose, video: HTMLVideoElement) {
    try {
      const form = new FormData();
      form.append("draft_id", draftId);
      form.append("pose", pose);
      form.append("image", await captureFrame(video), "frame.jpg");
      return await api<EnrollFrameResult>("/enroll/frame", { form });
    } catch (e) {
      setError(errorMessage(e));
      return null;
    }
  }

  function advance() {
    const next = loop.current.stepIdx + 1;
    loop.current.stepIdx = next;
    loop.current.stableSince = performance.now();
    setStepIdx(next);
    if (next >= STEPS.length) complete();
  }

  async function complete() {
    setFinishing(true);
    try {
      onDone(await api<{ embeddings: number }>("/enroll/complete", { json: { draft_id: draftId } }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const step = STEPS[stepIdx];
  return (
    <>
      <PageHeader
        title={`Face scan · ${name}`}
        subtitle="Follow the prompt on the video. Frames are captured automatically when the head is in position and still."
        actions={<button className="secondary" onClick={onCancel}><X size={17} /> Cancel</button>}
      />
      {(camera.error || error) && <div className="alert bad">{camera.error || error}</div>}
      <div className="pose-steps">
        {STEPS.map((s, i) => (
          <div key={s.pose} className={`pose-step ${i < stepIdx ? "done" : i === stepIdx ? "current" : ""}`}>
            <span style={{ fontSize: "1.2rem" }}>{i < stepIdx ? "✓" : s.arrow}</span>
            {s.pose}
            <div className="bar"><div style={{ width: `${(Math.min(counts[s.pose], FRAMES_PER_POSE) / FRAMES_PER_POSE) * 100}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="grid-2" style={{ alignItems: "start", gridTemplateColumns: "minmax(0, 1fr) 220px" }}>
        <div className="camera">
          <video ref={videoRef} playsInline muted />
          <div className={`frame ${reading?.good ? "good" : ""}`}>
            <span className="oval" /><i /><i /><i /><i />
            {reading?.good && <div className="scan" />}
          </div>
          <span className="live">LIVE</span>
          {reading && <div className="readout">yaw {reading.yaw.toFixed(0)}° · pitch {reading.relPitch.toFixed(0)}°</div>}
          <div className="prompt">
            {finishing ? "Saving…" : step ? <><span style={{ color: "var(--primary)", fontSize: "1.3rem" }}>{step.arrow}</span> {hint}</> : "Done"}
          </div>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <h3>Head position</h3>
          <p className="small muted">Move the dot into the green box.</p>
          {step && <PosePad yaw={reading?.yaw ?? 0} pitch={reading?.relPitch ?? 0} target={step.target} active={!!reading?.faces} />}
          {serverIssue && <div className="alert warn small" style={{ marginTop: "0.75rem", marginBottom: 0 }}>{serverIssue}</div>}
          <p className="small muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>Even light on the face helps most.</p>
        </div>
      </div>
    </>
  );
}

export default function EnrollPage() {
  return (
    <Suspense>
      <EnrollInner />
    </Suspense>
  );
}
