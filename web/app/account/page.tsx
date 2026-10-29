"use client";

import { KeyRound, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/Art";
import { PageHeader } from "@/components/Shell";
import { api, errorMessage, type Staff } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AccountPage() {
  const { staff, setProfile } = useAuth();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.next !== form.confirm) return setMsg({ kind: "bad", text: "The new passwords don't match" });
    try {
      setProfile(await api<Staff>("/auth/password", { json: { current_password: form.current, new_password: form.next } }));
      setForm({ current: "", next: "", confirm: "" });
      setMsg({ kind: "ok", text: "Password updated." });
    } catch (err) {
      setMsg({ kind: "bad", text: errorMessage(err) });
    }
  }

  if (!staff) return null;
  return (
    <>
      <PageHeader title="Account" subtitle="Your profile and sign-in settings" />
      <div className="grid">
        <div className="card">
          <div className="person" style={{ marginBottom: "1.25rem" }}>
            <Avatar name={staff.name} size={56} />
            <div>
              <b style={{ fontSize: "1.15rem" }}>{staff.name}</b>
              <span>{staff.email}</span>
            </div>
          </div>
          <span className="badge primary" style={{ textTransform: "capitalize" }}>{staff.role}</span>
          <div style={{ marginTop: "1.5rem" }}>
            <Link href="/welcome" className="btn secondary"><PlayCircle size={17} /> Replay the onboarding tour</Link>
          </div>
        </div>
        <form className="card" onSubmit={submit}>
          <h2 className="row" style={{ alignItems: "center", gap: "0.5rem" }}><KeyRound size={18} /> Change password</h2>
          {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
          <div className="stack">
            <label>Current password<input type="password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required /></label>
            <label>New password<input type="password" minLength={8} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required /></label>
            <label>Confirm new password<input type="password" minLength={8} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required /></label>
            <button>Update password</button>
          </div>
        </form>
      </div>
    </>
  );
}
