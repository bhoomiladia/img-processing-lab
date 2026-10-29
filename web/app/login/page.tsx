"use client";

import { Lock, Mail, ScanFace, ShieldCheck, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { HeroArt, Logo } from "@/components/Art";
import { api, errorMessage, storeSession, type Staff } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { setProfile } = useAuth();
  const router = useRouter();
  const [signup, setSignup] = useState<{ allow_signup: boolean; needs_first_admin: boolean } | null>(null);

  useEffect(() => {
    api<{ allow_signup: boolean; needs_first_admin: boolean }>("/auth/signup-status").then(setSignup).catch(() => {});
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; staff: Staff }>("/auth/login", { json: { email, password } });
      storeSession(res.token, res.staff);
      setProfile(res.staff);
      router.replace(res.staff.must_change_password || !res.staff.onboarded ? "/welcome" : "/");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="split">
      <section className="hero">
        <div className="brand" style={{ padding: 0 }}>
          <Logo /> Presently
        </div>
        <h2>Attendance that takes seconds, not ten minutes of roll call.</h2>
        <ul>
          <li><ScanFace size={20} color="var(--primary)" /> Students just look at the camera</li>
          <li><ShieldCheck size={20} color="var(--teal)" /> Liveness check stops photo proxies</li>
          <li><Timer size={20} color="#d2621f" /> Reports and CSV export ready instantly</li>
        </ul>
        <HeroArt />
      </section>

      <section className="panel">
        <div>
          <div className="brand" style={{ padding: "0 0 1.75rem" }}>
            <Logo size={40} />
          </div>
          <h1>Welcome back</h1>
          <p className="muted" style={{ margin: "0.4rem 0 1.5rem" }}>Sign in with the staff account your admin gave you.</p>
          {signup?.needs_first_admin && (
            <div className="alert info">
              <span>Fresh install: no accounts yet. <Link href="/signup"><b>Create the admin account</b></Link> to get started.</span>
            </div>
          )}
          {error && <div className="alert bad">{error}</div>}
          <form onSubmit={submit} className="stack">
            <label>
              Email
              <div style={{ position: "relative" }}>
                <Mail size={17} style={{ position: "absolute", left: 12, top: 12 }} color="var(--muted)" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus style={{ width: "100%", paddingLeft: 38 }} placeholder="you@college.edu" />
              </div>
            </label>
            <label>
              Password
              <div style={{ position: "relative" }}>
                <Lock size={17} style={{ position: "absolute", left: 12, top: 12 }} color="var(--muted)" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: "100%", paddingLeft: 38 }} placeholder="••••••••" />
              </div>
            </label>
            <button className="lg" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <p className="small muted" style={{ marginTop: "1.5rem" }}>
            {signup?.allow_signup ? (
              <>New teacher? <Link href="/signup"><b>Create an account</b></Link>. An admin will approve it.</>
            ) : (
              <>New teacher? Ask your admin for an account. You&apos;ll set your own password the first time you sign in.</>
            )}
          </p>
        </div>
      </section>
    </div>
  );
}
