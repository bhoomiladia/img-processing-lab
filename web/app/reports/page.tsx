"use client";

import { AlertTriangle, Download, Percent, Users } from "lucide-react";
import { useState } from "react";
import { Avatar, EmptyArt } from "@/components/Art";
import { PageHeader } from "@/components/Shell";
import { api, errorMessage, type ClassRow, type ReportRow } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";

const MIN_ATTENDANCE = 75;

export default function ReportsPage() {
  const classes = useLoad<ClassRow[]>("/classes");
  const [filters, setFilters] = useState({ class_id: "", from: "", to: "" });
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const report = useLoad<{ total_sessions: number; rows: ReportRow[] }>(filters.class_id ? `/reports?${query}` : null);
  const [error, setError] = useState<string | null>(null);

  async function downloadCsv() {
    try {
      const res = await api<Response>(`/reports?${query}&format=csv`, { raw: true });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      const cls = classes.data?.find((c) => String(c.id) === filters.class_id)?.name ?? "class";
      a.href = url;
      a.download = `attendance-${cls}${filters.from ? `-${filters.from}` : ""}${filters.to ? `-to-${filters.to}` : ""}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const rows = report.data?.rows ?? [];
  const withPct = rows.filter((r) => r.percentage != null);
  const avg = withPct.length ? withPct.reduce((a, r) => a + r.percentage!, 0) / withPct.length : null;
  const below = withPct.filter((r) => r.percentage! < MIN_ATTENDANCE).length;

  return (
    <>
      <PageHeader title="Reports" subtitle="Attendance percentages by class and date range" />
      {(error || report.error) && <div className="alert bad">{error || report.error}</div>}
      <div className="card row">
        <label>
          Class
          <select value={filters.class_id} onChange={(e) => setFilters({ ...filters, class_id: e.target.value })}>
            <option value="">Choose a class…</option>
            {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>From<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
        <label>To<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
        <button className="secondary" disabled={!filters.class_id} onClick={downloadCsv} style={{ marginLeft: "auto" }}>
          <Download size={17} /> Download CSV
        </button>
      </div>

      {!filters.class_id && (
        <div className="card empty">
          <EmptyArt />
          <h3>Pick a class to see its report</h3>
          <p className="small">Add a date range to look at a single month or semester.</p>
        </div>
      )}

      {report.data && (
        <>
          <div className="stats">
            <div className="stat"><div className="icon-tile tone-primary"><Users size={22} /></div><div><div className="value">{report.data.total_sessions}</div><div className="label">Sessions held</div></div></div>
            <div className="stat"><div className="icon-tile tone-teal"><Percent size={22} /></div><div><div className="value">{avg == null ? "—" : `${avg.toFixed(0)}%`}</div><div className="label">Average attendance</div></div></div>
            <div className="stat"><div className="icon-tile tone-peach"><AlertTriangle size={22} /></div><div><div className="value">{below}</div><div className="label">Below {MIN_ATTENDANCE}%</div></div></div>
          </div>
          <div className="card table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Attended</th><th style={{ width: "40%" }}>Percentage</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id}>
                    <td><div className="person"><Avatar name={r.name} /><div><b>{r.name}</b><span>{r.roll_no}</span></div></div></td>
                    <td>{r.attended} / {r.total}</td>
                    <td>
                      {r.percentage == null ? <span className="muted">No sessions</span> : (
                        <div className="row" style={{ alignItems: "center", flexWrap: "nowrap" }}>
                          <div className={`bar ${r.percentage >= MIN_ATTENDANCE ? "teal" : ""}`} style={{ flex: 1 }}>
                            <div style={{ width: `${r.percentage}%`, background: r.percentage < MIN_ATTENDANCE ? "var(--bad)" : undefined }} />
                          </div>
                          <span className={`badge ${r.percentage >= MIN_ATTENDANCE ? "ok" : "bad"}`}>{r.percentage}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
