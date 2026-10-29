"use client";

import { BookOpen, MonitorPlay } from "lucide-react";
import Link from "next/link";
import type { SessionRow } from "@/lib/api";

export function isOpen(s: SessionRow) {
  const now = Date.now();
  return new Date(s.start_time).getTime() - 15 * 60e3 <= now && now <= new Date(s.end_time).getTime() + 15 * 60e3;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { timeStyle: "short" });

export default function SessionList({ sessions }: { sessions: SessionRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Session</th><th>When</th><th>Attendance</th><th /></tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const pct = s.total ? (s.present / s.total) * 100 : 0;
            return (
              <tr key={s.id}>
                <td>
                  <div className="person">
                    <div className="icon-tile tone-primary" style={{ width: 38, height: 38 }}><BookOpen size={18} /></div>
                    <div><b>{s.subject}</b><span>{s.class_name}</span></div>
                  </div>
                </td>
                <td className="small">
                  {new Date(s.start_time).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  <div className="muted">{timeOf(s.start_time)} – {timeOf(s.end_time)}</div>
                </td>
                <td style={{ minWidth: 130 }}>
                  <div className="small" style={{ marginBottom: 4 }}><b>{s.present}</b> <span className="muted">/ {s.total}</span></div>
                  <div className="bar teal" style={{ height: 6 }}><div style={{ width: `${pct}%` }} /></div>
                </td>
                <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                  <Link className="btn secondary sm" href={`/sessions/${s.id}`}>Roster</Link>{" "}
                  {isOpen(s) && <Link className="btn sm" href={`/kiosk/${s.id}`}><MonitorPlay size={15} /> Kiosk</Link>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
