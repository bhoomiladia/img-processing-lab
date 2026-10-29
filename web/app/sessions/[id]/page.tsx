"use client";

import { ArrowLeft, MonitorPlay, Undo2, UserCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/Art";
import { PageHeader } from "@/components/Shell";
import { api, errorMessage, type RosterRow, type SessionRow } from "@/lib/api";
import { fmtTime, useLoad } from "@/lib/useLoad";

export default function SessionRosterPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useLoad<{ session: SessionRow; roster: RosterRow[] }>(`/sessions/${id}/attendance`);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(path: string, method: "POST" | "DELETE", json?: unknown) {
    setActionError(null);
    try {
      await api(path, { method, json });
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  if (error) return <div className="alert bad">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;
  const { session, roster } = data;
  const present = roster.filter((r) => r.marked_at).length;
  const pct = roster.length ? (present / roster.length) * 100 : 0;

  return (
    <>
      <Link href="/sessions" className="small"><ArrowLeft size={14} style={{ verticalAlign: "-2px" }} /> Sessions</Link>
      <PageHeader
        title={`${session.subject} · ${session.class_name}`}
        subtitle={fmtTime(session.start_time)}
        actions={<Link className="btn" href={`/kiosk/${session.id}`}><MonitorPlay size={17} /> Open kiosk</Link>}
      />
      {actionError && <div className="alert bad">{actionError}</div>}

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <b>{present} of {roster.length} present</b>
          <span className="muted small">{pct.toFixed(0)}%</span>
        </div>
        <div className="bar teal"><div style={{ width: `${pct}%` }} /></div>
      </div>

      <div className="card table-wrap">
        <table>
          <thead><tr><th>Student</th><th>Status</th><th>Marked at</th><th>Match</th><th /></tr></thead>
          <tbody>
            {roster.map((r) => (
              <tr key={r.user_id}>
                <td>
                  <div className="person">
                    <Avatar name={r.name} />
                    <div><b>{r.name}</b><span>{r.roll_no}{!r.face_enrolled && " · no face data"}</span></div>
                  </div>
                </td>
                <td>{r.marked_at ? <span className="badge ok">Present{r.method === "manual" ? " · manual" : ""}</span> : <span className="badge bad">Absent</span>}</td>
                <td className="small">{r.marked_at ? new Date(r.marked_at).toLocaleTimeString(undefined, { timeStyle: "short" }) : "—"}</td>
                <td className="small">{r.confidence != null ? `${(r.confidence * 100).toFixed(0)}%` : "—"}</td>
                <td style={{ textAlign: "right" }}>
                  {r.marked_at ? (
                    <button className="ghost sm" onClick={() => act(`/sessions/${id}/attendance/${r.user_id}`, "DELETE")}><Undo2 size={14} /> Undo</button>
                  ) : (
                    <button className="secondary sm" onClick={() => act(`/sessions/${id}/attendance/manual`, "POST", { user_id: r.user_id })}>
                      <UserCheck size={14} /> Mark present
                    </button>
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
