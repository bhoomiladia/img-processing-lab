"use client";

import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { EmptyArt, SessionArt } from "@/components/Art";
import SessionList from "@/components/SessionList";
import { PageHeader } from "@/components/Shell";
import { api, errorMessage, type ClassRow, type SessionRow } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";

function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export default function SessionsPage() {
  const classes = useLoad<ClassRow[]>("/classes");
  const sessions = useLoad<SessionRow[]>("/sessions");
  const now = localInput(new Date());
  const later = localInput(new Date(Date.now() + 50 * 60e3));
  const [form, setForm] = useState({ class_id: "", subject: "", date: now.date, start: now.time, end: later.time });
  const [error, setError] = useState<string | null>(null);

  async function createSession(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/sessions", {
        json: {
          class_id: Number(form.class_id),
          subject: form.subject,
          start_time: new Date(`${form.date}T${form.start}`).toISOString(),
          end_time: new Date(`${form.date}T${form.end}`).toISOString(),
        },
      });
      setForm({ ...form, subject: "" });
      sessions.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader title="Sessions" subtitle="Schedule lectures and open the attendance kiosk" />
      {(error || sessions.error) && <div className="alert bad">{error || sessions.error}</div>}

      <form className="card" onSubmit={createSession} style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ background: "var(--peach-soft)", borderRadius: 14, padding: "0.5rem" }}><SessionArt size={110} /></div>
        <div style={{ flex: 1, minWidth: 280 }}>
          <h2>Schedule a session</h2>
          {classes.data?.length === 0 && <div className="alert warn small">No classes yet. Create one on the <Link href="/classes">Classes</Link> page first.</div>}
          <div className="row">
            <label>
              Class
              <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} required>
                <option value="">Choose…</option>
                {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label style={{ flex: 1, minWidth: 140 }}>
              Subject
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. DBMS" required />
            </label>
            <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
            <label>From<input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} required /></label>
            <label>To<input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} required /></label>
            <button><CalendarPlus size={17} /> Create</button>
          </div>
        </div>
      </form>

      <div className="card">
        <div className="card-title"><h2>All sessions</h2></div>
        {sessions.data?.length ? (
          <SessionList sessions={sessions.data} />
        ) : (
          sessions.data && (
            <div className="empty">
              <EmptyArt />
              <h3>No sessions yet</h3>
              <p className="small">Create your first one above. The kiosk button appears when it&apos;s time for class.</p>
            </div>
          )
        )}
      </div>
    </>
  );
}
