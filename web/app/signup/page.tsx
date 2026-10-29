"use client";

import { Clock, Lock, Mail, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { HeroArt, Logo } from "@/components/Art";
import { api, errorMessage, storeSession, type Staff } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Status = { allow_signup: boolean; needs_first_admin: boolean };
type SignupResult = { status: "pending" } | { status: "active"; token: string; staff: Staff };

export default function SignupPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const { setProfile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    api<Status>("/auth/signup-status").then(setStatus).catch((e) => setError(errorMessage(e)));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) return setError("The passwords don't match");
    setBusy(true);
    setError(null);
    try {
      const res = await api<SignupResult>("/auth/signup", { json: { name: form.name, email: form.email, password: form.password } });
      if (res.status === "active") {
        storeSession(res.token, res.staff);
        setProfile(res.staff);
        router.replace("/welcome");
      } else {
        setPending(true);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const firstAdmin = status?.needs_first_admin;
  const field = (key: keyof typeof form, label: string, Icon: typeof Mail, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label>
      {label}
      <div style={{ position: "relative" }}>
        <Icon size={17} style={{ position: "absolute", left: 12, top: 12 }} color="var(--muted)" />
        <input {...props} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required style={{ width: "100%", paddingLeft: 38 }} />
      </div>
    </label>
  );

  return (
    <div className="split">
      <section className="hero">
        <div className="brand" style={{ padding: 0 }}><Logo /> Presently</div>
        <h2>{firstAdmin ? "Set up Presently for your college in a few minutes." : "Join your college's attendance system."}</h2>
        <ul>
          <li><ShieldCheck size={20} color="var(--teal)" /> {firstAdmin ? "You'll be the admin: invite or approve teachers next" : "An admin approves new teacher accounts"}</li>
          <li><Clock size={20} color="#d2621f" /> A short guided tour after your first sign-in</li>
        </ul>
        <HeroArt />
      </section>

      <section className="panel">
        <div>
          <div className="brand" style={{ padding: "0 0 1.75rem" }}><Logo size={40} /></div>
          {pending ? (
            <>
              <div className="icon-tile tone-teal" style={{ width: 56, height: 56, borderRadius: "50%", marginBottom: "1rem" }}><Clock size={28} /></div>
              <h1>Request sent</h1>
              <p className="muted" style={{ margin: "0.5rem 0 1.5rem" }}>
                Your account is waiting for an admin to approve it. Once approved, sign in with <b>{form.email}</b> and the password you chose.
              </p>
              <Link className="btn lg" href="/login" style={{ width: "100%" }}>Back to sign in</Link>
            </>
          ) : status && !status.allow_signup ? (
            <>
              <h1>Sign-up is turned off</h1>
              <p className="muted" style={{ margin: "0.5rem 0 1.5rem" }}>Ask your admin to create an account for you.</p>
              <Link className="btn secondary lg" href="/login" style={{ width: "100%" }}>Back to sign in</Link>
            </>
          ) : (
            <>
              <h1>{firstAdmin ? "Create the admin account" : "Create your account"}</h1>
              <p className="muted" style={{ margin: "0.4rem 0 1.5rem" }}>
                {firstAdmin ? "This is a fresh install. The first account manages classes, staff and data." : "For teachers. An admin will approve your request."}
              </p>
              {error && <div className="alert bad">{error}</div>}
              <form onSubmit={submit} className="stack">
                {field("name", "Full name", User, { autoFocus: true, placeholder: "e.g. Priya Sharma" })}
                {field("email", "Work email", Mail, { type: "email", placeholder: "you@college.edu" })}
                {field("password", "Password", Lock, { type: "password", minLength: 8, placeholder: "At least 8 characters" })}
                {field("confirm", "Confirm password", Lock, { type: "password", minLength: 8 })}
                <button className="lg" disabled={busy || !status}>{busy ? "Creating…" : firstAdmin ? "Create admin account" : "Request account"}</button>
              </form>
              <p className="small muted" style={{ marginTop: "1.5rem" }}>
                Already have an account? <Link href="/login">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
