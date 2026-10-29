"use client";

import { Check, Copy, KeyRound, UserPlus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/Art";
import { PageHeader } from "@/components/Shell";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/useLoad";

type StaffRow = { id: number; email: string; name: string; role: string; must_change_password: boolean; onboarded: boolean; approved: boolean };
type Invite = { name: string; email: string; password: string; reset: boolean };

export default function StaffPage() {
  const { staff: me } = useAuth();
  const staff = useLoad<StaffRow[]>("/staff");
  const [form, setForm] = useState({ name: "", email: "", role: "teacher" });
  const [invite, setInvite] = useState<Invite | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<StaffRow & { temporary_password: string }>("/staff", { json: form });
      setInvite({ name: r.name, email: r.email, password: r.temporary_password, reset: false });
      setCopied(false);
      setForm({ name: "", email: "", role: "teacher" });
      staff.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function reset(s: StaffRow) {
    if (!confirm(`Reset ${s.name}'s password? They'll get a new temporary password and must choose their own on next sign-in.`)) return;
    try {
      const r = await api<{ email: string; temporary_password: string }>(`/staff/${s.id}/reset-password`, { method: "POST" });
      setInvite({ name: s.name, email: r.email, password: r.temporary_password, reset: true });
      setCopied(false);
      staff.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function approve(s: StaffRow) {
    try {
      await api(`/staff/${s.id}/approve`, { method: "POST" });
      staff.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(s: StaffRow, verb: string) {
    if (!confirm(`${verb} ${s.name} (${s.email})?`)) return;
    try {
      await api(`/staff/${s.id}`, { method: "DELETE" });
      staff.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const pending = staff.data?.filter((s) => !s.approved) ?? [];
  const members = staff.data?.filter((s) => s.approved) ?? [];

  const inviteText = invite &&
    `Hi ${invite.name.split(" ")[0]}, ${invite.reset ? "your Presently password was reset" : "you've been added to Presently, our face attendance system"}.\n\n` +
    `Sign in: ${window.location.origin}/login\nEmail: ${invite.email}\nTemporary password: ${invite.password}\n\n` +
    `You'll choose your own password and get a short setup tour when you first sign in.`;

  return (
    <>
      <PageHeader title="Staff" subtitle="Invite teachers and manage who can run attendance" />
      {(error || staff.error) && <div className="alert bad">{error || staff.error}</div>}

      <div className="grid-2">
        <form className="card" onSubmit={create}>
          <h2 className="row" style={{ alignItems: "center", gap: "0.5rem" }}><UserPlus size={19} /> Invite a teacher</h2>
          <div className="stack">
            <label>Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Priya Sharma" /></label>
            <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="priya@college.edu" /></label>
            <label>
              Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="teacher">Teacher: run sessions, enroll students, view reports</option>
                <option value="admin">Admin: also manage classes, staff and data deletion</option>
              </select>
            </label>
            <button>Create account</button>
            <p className="small muted" style={{ margin: 0 }}>A temporary password is generated for you to share. They&apos;ll replace it on first sign-in.</p>
          </div>
        </form>

        {invite ? (
          <div className="card" style={{ borderColor: "#c9c1fb" }}>
            <h2>{invite.reset ? "Password reset" : "Account created"}: share these details</h2>
            <div className="credentials">{inviteText}</div>
            <div className="row" style={{ marginTop: "1rem" }}>
              <button className="secondary" onClick={() => { navigator.clipboard.writeText(inviteText!); setCopied(true); }}>
                <Copy size={16} /> {copied ? "Copied!" : "Copy message"}
              </button>
              <button className="ghost" onClick={() => setInvite(null)}>Done</button>
            </div>
            <p className="small muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>This password won&apos;t be shown again.</p>
          </div>
        ) : (
          <div className="card">
            <h2>What new teachers see</h2>
            <ol className="small muted" style={{ margin: 0, paddingLeft: "1.2rem", display: "grid", gap: "0.4rem" }}>
              <li>Sign in with the temporary password you share</li>
              <li>Choose their own password</li>
              <li>A quick tour of how Presently works</li>
              <li>A camera and lighting check for the kiosk device</li>
              <li>A setup checklist that guides them to their first attendance</li>
            </ol>
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <div className="card" style={{ borderColor: "#f3d29b" }}>
          <div className="card-title">
            <h2>Sign-up requests</h2>
            <span className="badge warn">{pending.length} waiting</span>
          </div>
          {pending.map((s) => (
            <div key={s.id} className="check-item" style={{ marginBottom: "0.5rem" }}>
              <div className="person grow"><Avatar name={s.name} /><div><b>{s.name}</b><span>{s.email} · wants a teacher account</span></div></div>
              <button className="sm" onClick={() => approve(s)}><Check size={15} /> Approve</button>
              <button className="danger sm" onClick={() => remove(s, "Reject the sign-up request from")}><X size={15} /> Reject</button>
            </div>
          ))}
        </div>
      )}

      <div className="card table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {members.map((s) => (
              <tr key={s.id}>
                <td><div className="person"><Avatar name={s.name} /><div><b>{s.name}</b><span>{s.email}</span></div></div></td>
                <td><span className="badge primary" style={{ textTransform: "capitalize" }}>{s.role}</span></td>
                <td>
                  {s.must_change_password ? <span className="badge warn">Invited, hasn&apos;t signed in</span>
                    : !s.onboarded ? <span className="badge muted">Onboarding</span>
                    : <span className="badge ok">Active</span>}
                </td>
                <td style={{ textAlign: "right" }}>
                  {s.id !== me?.id && (
                    <>
                      <button className="secondary sm" onClick={() => reset(s)}><KeyRound size={14} /> Reset password</button>{" "}
                      <button className="ghost sm" onClick={() => remove(s, "Remove the account of")} title="Remove account"><X size={15} /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
