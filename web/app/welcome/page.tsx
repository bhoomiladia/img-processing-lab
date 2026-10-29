"use client";

import { ArrowLeft, ArrowRight, KeyRound, Lightbulb, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { EnrollArt, HeroArt, KioskArt, Logo, SessionArt } from "@/components/Art";
import CameraCheck from "@/components/CameraCheck";
import SetupChecklist from "@/components/SetupChecklist";
import { api, errorMessage, type Overview, type Staff } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/useLoad";

type Step = "welcome" | "password" | "how" | "camera" | "checklist";

const HOW = [
  { art: <EnrollArt />, tone: "var(--primary-soft)", title: "Enroll once", text: "Each student does a guided 30-second face scan from five angles. Only numeric face templates are stored, never photos." },
  { art: <SessionArt />, tone: "var(--peach-soft)", title: "Schedule a session", text: "Create a session for your lecture: class, subject and time. It opens for attendance 15 minutes before it starts." },
  { art: <KioskArt />, tone: "var(--teal-soft)", title: "Students check in", text: "Open the kiosk. Each student looks at the camera and follows a quick head-turn prompt. Done in about 2 seconds each." },
];

const TIPS = [
  "Place the camera at eye level, about an arm's length from where students stand.",
  "Light should fall on faces from the front. Avoid a bright window behind students.",
  "One student at a time. The kiosk ignores frames with two faces.",
  "If someone isn't recognized, use “Mark manually”. Your roster stays accurate.",
];

export default function WelcomePage() {
  const { staff, setProfile } = useAuth();
  const router = useRouter();
  const overview = useLoad<Overview>("/overview");
  const [stepIdx, setStepIdx] = useState(0);
  const [finishing, setFinishing] = useState(false);
  // Fixed when the tour starts: changing the password must not reshuffle the remaining steps.
  const stepsRef = useRef<Step[] | null>(null);
  if (staff && !stepsRef.current)
    stepsRef.current = staff.must_change_password ? ["welcome", "password", "how", "camera", "checklist"] : ["welcome", "how", "camera", "checklist"];

  if (!staff) return null;
  const steps = stepsRef.current!;
  const step = steps[Math.min(stepIdx, steps.length - 1)];
  const next = () => setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setStepIdx((i) => Math.max(i - 1, 0));
  const firstName = staff.name.split(" ")[0];

  async function finish() {
    setFinishing(true);
    try {
      setProfile(await api<Staff>("/auth/onboarded", { method: "POST" }));
      router.replace("/");
    } catch {
      setFinishing(false);
    }
  }

  return (
    <div className="onboard">
      <div className="top">
        <div className="brand" style={{ padding: 0 }}>
          <Logo /> Presently
        </div>
        <div className="dots" aria-label={`Step ${stepIdx + 1} of ${steps.length}`}>
          {steps.map((s, i) => <i key={s} className={i === stepIdx ? "on" : i < stepIdx ? "done" : ""} />)}
        </div>
      </div>

      <div className="body">
        {step === "welcome" && (
          <div className="grid-2" style={{ alignItems: "center" }}>
            <div>
              <span className="badge primary"><Sparkles size={13} /> {staff.role === "admin" ? "Admin setup" : "Teacher onboarding"}</span>
              <h1 style={{ fontSize: "2.4rem", margin: "1rem 0" }}>Welcome to Presently, {firstName}!</h1>
              <p className="muted" style={{ fontSize: "1.08rem", maxWidth: "46ch" }}>
                Presently marks attendance by face, with a quick liveness check so nobody can hold up a friend&apos;s photo.
                Let&apos;s get you ready for your first class. It takes about 3 minutes.
              </p>
              <div className="row" style={{ marginTop: "1.5rem" }}>
                <button className="lg" onClick={next}>Get started <ArrowRight size={18} /></button>
                {!staff.must_change_password && staff.onboarded && (
                  <button className="lg secondary" onClick={() => router.replace("/")}>Back to dashboard</button>
                )}
              </div>
            </div>
            <div className="center"><HeroArt /></div>
          </div>
        )}

        {step === "password" && <PasswordStep onDone={(p) => { setProfile(p); next(); }} />}

        {step === "how" && (
          <>
            <h1>How Presently works</h1>
            <p className="muted" style={{ margin: "0.4rem 0 1.5rem" }}>Three steps, and only the first one takes any real time.</p>
            <div className="grid">
              {HOW.map((h, i) => (
                <div key={h.title} className="feature">
                  <div className="art" style={{ background: h.tone }}>{h.art}</div>
                  <div className="num">STEP {i + 1}</div>
                  <h3>{h.title}</h3>
                  <p className="muted small" style={{ margin: 0 }}>{h.text}</p>
                </div>
              ))}
            </div>
            <Nav back={back} next={next} />
          </>
        )}

        {step === "camera" && (
          <>
            <h1>Check your kiosk device</h1>
            <p className="muted" style={{ margin: "0.4rem 0 1.5rem" }}>
              Sit where a student would stand. We&apos;ll make sure the camera, distance and lighting are good enough for reliable recognition.
            </p>
            <CameraCheck />
            <div className="card" style={{ marginTop: "1.25rem" }}>
              <h2 className="row" style={{ alignItems: "center", gap: "0.5rem" }}><Lightbulb size={19} color="#d2621f" /> Classroom tips</h2>
              <ul className="small" style={{ margin: 0, paddingLeft: "1.2rem", display: "grid", gap: "0.35rem" }}>
                {TIPS.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
            <Nav back={back} next={next} nextLabel="Continue" />
          </>
        )}

        {step === "checklist" && (
          <div className="grid-2" style={{ alignItems: "start" }}>
            <div>
              <h1>You&apos;re all set, {firstName}</h1>
              <p className="muted" style={{ margin: "0.4rem 0 1.5rem" }}>
                Here&apos;s your path to the first attendance. This checklist stays on your dashboard and ticks itself off as you go.
              </p>
              {overview.data ? <SetupChecklist overview={overview.data} staff={staff} /> : <p className="muted">Loading…</p>}
              <div className="row" style={{ marginTop: "1.5rem" }}>
                <button className="secondary lg" onClick={back}><ArrowLeft size={18} /> Back</button>
                <button className="lg" onClick={finish} disabled={finishing}>Go to dashboard <ArrowRight size={18} /></button>
              </div>
            </div>
            <div className="center"><KioskArt size={300} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

function Nav({ back, next, nextLabel = "Next" }: { back: () => void; next: () => void; nextLabel?: string }) {
  return (
    <div className="row" style={{ marginTop: "1.5rem", justifyContent: "space-between" }}>
      <button className="secondary lg" onClick={back}><ArrowLeft size={18} /> Back</button>
      <button className="lg" onClick={next}>{nextLabel} <ArrowRight size={18} /></button>
    </div>
  );
}

function PasswordStep({ onDone }: { onDone: (p: Staff) => void }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.next !== form.confirm) return setError("The new passwords don't match");
    setBusy(true);
    setError(null);
    try {
      onDone(await api<Staff>("/auth/password", { json: { current_password: form.current, new_password: form.next } }));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ maxWidth: 460, margin: "0 auto" }}>
      <div className="icon-tile tone-primary" style={{ marginBottom: "1rem" }}><KeyRound size={22} /></div>
      <h1>Set your own password</h1>
      <p className="muted" style={{ margin: "0.4rem 0 1.25rem" }}>You signed in with a temporary password from your admin. Choose one only you know.</p>
      {error && <div className="alert bad">{error}</div>}
      <div className="stack">
        <label>Temporary password<input type="password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required autoFocus /></label>
        <label>New password<input type="password" minLength={8} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required placeholder="At least 8 characters" /></label>
        <label>Confirm new password<input type="password" minLength={8} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required /></label>
        <button className="lg" disabled={busy}>{busy ? "Saving…" : "Save and continue"}</button>
      </div>
    </form>
  );
}
