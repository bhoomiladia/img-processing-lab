"use client";

import { CheckCircle2, Info, LogOut, UserCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, errorMessage, type RecognizeResult, type RosterRow, type SessionRow } from "@/lib/api";
import { Avatar, Logo } from "@/components/Art";
import { captureFrame, useCamera } from "@/lib/camera";
import { loadLandmarker, readPose } from "@/lib/facePose";
import { useLoad } from "@/lib/useLoad";

const SEND_INTERVAL_MS = 400;
const COOLDOWN_MS = 2500;
const UNKNOWN_FRAMES_BEFORE_FALLBACK = 3;
const ARROWS: Record<string, string> = { turn_left: "←", turn_right: "→", look_up: "↑" };

type Toast = { kind: "ok" | "warn"; text: string };

export default function KioskPage() {
  const { id } = useParams<{ id: string }>();
  const sessionId = Number(id);
  const roster = useLoad<{ session: SessionRow; roster: RosterRow[] }>(`/sessions/${id}/attendance`);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useCamera(videoRef);
  // The capture loop outlives renders, so read the latest reload through a ref.
  const reloadRoster = useRef(roster.reload);
  reloadRoster.current = roster.reload;

  const [prompt, setPrompt] = useState("Loading face tracker…");
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [notRecognized, setNotRecognized] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const t = () => setClock(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
    t();
    const h = setInterval(t, 10_000);
    return () => clearInterval(h);
  }, []);

  const loop = useRef({ attemptId: null as string | null, inFlight: false, lastSent: 0, pausedUntil: 0, unknown: 0, lastFaceAt: 0 });

  function showToast(t: Toast) {
    setToast(t);
    setTimeout(() => setToast(null), COOLDOWN_MS);
  }

  useEffect(() => {
    if (!camera.ready) return;
    let stopped = false;
    let timer = 0;
    loadLandmarker()
      .then((lm) => {
        setPrompt("Step up to the camera");
        const tick = () => {
          if (stopped) return;
          const s = loop.current;
          const video = videoRef.current!;
          const now = performance.now();
          const { faces } = readPose(lm, video, now);
          if (faces > 0) s.lastFaceAt = now;
          // Nobody in front of the camera for a while: drop the half-finished attempt.
          if (now - s.lastFaceAt > 2000 && s.attemptId) {
            s.attemptId = null;
            s.unknown = 0;
            setProgress(0);
            setChallenge(null);
            setNotRecognized(false);
            setPrompt("Step up to the camera");
          }
          if (faces > 0 && !s.inFlight && now >= s.pausedUntil && now - s.lastSent >= SEND_INTERVAL_MS) {
            s.inFlight = true;
            s.lastSent = now;
            recognize(video).finally(() => (s.inFlight = false));
          }
          timer = window.setTimeout(tick, 80);
        };
        tick();
      })
      .catch(() => setFatal("Could not load the face tracker. Check your internet connection."));
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [camera.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  async function recognize(video: HTMLVideoElement) {
    const s = loop.current;
    try {
      const form = new FormData();
      form.append("session_id", String(sessionId));
      if (s.attemptId) form.append("attempt_id", s.attemptId);
      form.append("image", await captureFrame(video), "frame.jpg");
      const res = await api<RecognizeResult>("/recognize", { form });

      if (res.status === "marked" || res.status === "already_marked") {
        s.attemptId = null;
        s.unknown = 0;
        s.pausedUntil = performance.now() + COOLDOWN_MS;
        setProgress(0);
        setChallenge(null);
        setNotRecognized(false);
        setPrompt("Next person, please");
        showToast(
          res.status === "marked"
            ? { kind: "ok", text: `${res.user.name} marked present` }
            : { kind: "warn", text: `${res.user.name} is already marked` },
        );
        if (res.status === "marked") reloadRoster.current();
        return;
      }

      if ("attempt_id" in res) s.attemptId = res.attempt_id ?? s.attemptId;
      if (res.status === "unknown") {
        s.unknown += 1;
        if (s.unknown >= UNKNOWN_FRAMES_BEFORE_FALLBACK) setNotRecognized(true);
        setPrompt("Look straight at the camera");
        return;
      }
      s.unknown = 0;
      setNotRecognized(false);
      if (res.status === "verifying") {
        setPrompt(res.prompt);
        setChallenge(res.prompt.startsWith("Look straight") || res.prompt.startsWith("Hold") ? null : res.challenge);
        setProgress(res.progress);
      } else if (res.status === "wrong_class") {
        setPrompt("You're not enrolled in this class");
      } else if (res.status === "multiple_faces") {
        setPrompt("One person at a time, please");
      } else if (res.status === "low_quality") {
        setPrompt(res.issues[0] ?? "Hold still");
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setFatal(e.message);
        s.pausedUntil = Infinity;
      } else {
        setPrompt(`Connection problem: ${errorMessage(e)}`);
        s.pausedUntil = performance.now() + 1500;
      }
    }
  }

  async function markManual(userId: number, name: string) {
    try {
      await api(`/sessions/${id}/attendance/manual`, { json: { user_id: userId } });
      setManualOpen(false);
      setNotRecognized(false);
      loop.current.unknown = 0;
      showToast({ kind: "ok", text: `${name} marked present (manual)` });
      roster.reload();
    } catch (e) {
      setFatal(errorMessage(e));
    }
  }

  const rows = roster.data?.roster ?? [];
  const present = rows.filter((r) => r.marked_at).sort((a, b) => (b.marked_at! > a.marked_at! ? 1 : -1));
  const absent = rows.filter((r) => !r.marked_at);
  const session = roster.data?.session;

  const arrowPos: Record<string, React.CSSProperties> = {
    turn_left: { left: "16%", ["--nx" as string]: "-14px" },
    turn_right: { right: "16%", ["--nx" as string]: "14px" },
    look_up: { left: "50%", top: "14%", marginLeft: "-1.2rem", ["--ny" as string]: "-12px" },
  };

  return (
    <div className="kiosk-wrap">
      <div className="kiosk-top">
        <div className="brand" style={{ padding: 0 }}><Logo /> Presently</div>
        <div style={{ flex: 1 }}>
          <b>{session ? `${session.subject} · ${session.class_name}` : "Attendance"}</b>
        </div>
        <span className="clock">{clock}</span>
        <Link className="btn secondary sm" href={`/sessions/${id}`}><LogOut size={15} /> Exit kiosk</Link>
      </div>
      {(camera.error || fatal || roster.error) && <div className="alert bad">{camera.error || fatal || roster.error}</div>}

      <div className="kiosk">
        <div>
          <div className="camera">
            <video ref={videoRef} playsInline muted />
            <div className={`frame ${progress > 0 ? "good" : ""}`}>
              <span className="oval" /><i /><i /><i /><i />
              {progress > 0 && <div className="scan" />}
            </div>
            <span className="live">LIVE</span>
            {challenge && ARROWS[challenge] && <div className="challenge" style={arrowPos[challenge]}>{ARROWS[challenge]}</div>}
            <div className="prompt">
              {prompt}
              {progress > 0 && (
                <div className="bar teal" style={{ width: 80, height: 6 }}><div style={{ width: `${progress * 100}%` }} /></div>
              )}
            </div>
          </div>
          {notRecognized ? (
            <div className="alert warn" style={{ marginTop: "1rem", alignItems: "center" }}>
              <Info size={18} />
              <span style={{ flex: 1 }}>Not recognized. If you&apos;re enrolled, face the light and try again, or ask your teacher.</span>
              <button className="secondary sm" onClick={() => setManualOpen(true)}>Mark manually</button>
            </div>
          ) : (
            <p className="small muted center" style={{ marginTop: "1rem" }}>One student at a time · look at the camera and follow the arrow</p>
          )}
        </div>

        <div className="card" style={{ margin: 0 }}>
          <div className="card-title">
            <h2>Present</h2>
            <span className="badge ok">{present.length} / {rows.length}</span>
          </div>
          <div className="bar teal" style={{ marginBottom: "1rem" }}><div style={{ width: `${rows.length ? (present.length / rows.length) * 100 : 0}%` }} /></div>
          {present.length === 0 && <p className="muted small">No one marked yet.</p>}
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {present.map((r) => (
              <div key={r.user_id} className="person" style={{ padding: "0.45rem 0", borderBottom: "1px solid var(--border)" }}>
                <Avatar name={r.name} size={30} />
                <div style={{ flex: 1 }}><b className="small">{r.name}</b><span>{r.roll_no}{r.method === "manual" ? " · manual" : ""}</span></div>
                <span className="small muted">{new Date(r.marked_at!).toLocaleTimeString(undefined, { timeStyle: "short" })}</span>
              </div>
            ))}
          </div>
          <button className="secondary" style={{ marginTop: "1rem", width: "100%" }} onClick={() => setManualOpen(true)}><UserCheck size={16} /> Manual mark</button>
        </div>
      </div>

      {manualOpen && (
        <div className="modal-backdrop" onClick={() => setManualOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Mark a student present</h2>
            <p className="muted small">Teacher fallback for students who can&apos;t be recognized.</p>
            {absent.map((r) => (
              <button key={r.user_id} className="secondary list-button" onClick={() => markManual(r.user_id, r.name)}>
                <span className="person"><Avatar name={r.name} size={26} /> {r.name}</span>
                <span className="muted">{r.roll_no}</span>
              </button>
            ))}
            {absent.length === 0 && <p>Everyone is marked.</p>}
            <button onClick={() => setManualOpen(false)} style={{ width: "100%" }}>Close</button>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast">
          <div className={`icon-tile ${toast.kind === "ok" ? "tone-teal" : "tone-peach"}`}>{toast.kind === "ok" ? <CheckCircle2 size={22} /> : <Info size={22} />}</div>
          {toast.text}
        </div>
      )}
    </div>
  );
}
