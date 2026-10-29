"use client";

import { RefreshCcw, ScanFace, Trash2, UserMinus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Avatar, EmptyArt } from "@/components/Art";
import { PageHeader } from "@/components/Shell";
import { api, errorMessage, type ClassRow, type StudentRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/useLoad";

function StudentsInner() {
  const { staff } = useAuth();
  const params = useSearchParams();
  const classes = useLoad<ClassRow[]>("/classes");
  const [classId, setClassId] = useState(params.get("class_id") ?? "");
  const students = useLoad<StudentRow[]>(`/users${classId ? `?class_id=${classId}` : ""}`);
  const [message, setMessage] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  async function deleteFace(s: StudentRow) {
    if (!confirm(`Permanently delete all face data for ${s.name}? Attendance history is kept.`)) return;
    try {
      const r = await api<{ deleted_embeddings: number }>(`/users/${s.id}/face-data`, { method: "DELETE" });
      setMessage({ kind: "ok", text: `Deleted ${r.deleted_embeddings} face templates for ${s.name}.` });
      students.reload();
    } catch (e) {
      setMessage({ kind: "bad", text: errorMessage(e) });
    }
  }

  async function deleteStudent(s: StudentRow) {
    if (!confirm(`Remove ${s.name} entirely, including face data and attendance history?`)) return;
    try {
      await api(`/users/${s.id}`, { method: "DELETE" });
      setMessage({ kind: "ok", text: `Removed ${s.name}.` });
      students.reload();
    } catch (e) {
      setMessage({ kind: "bad", text: errorMessage(e) });
    }
  }

  const reenrollHref = (s: StudentRow) =>
    `/enroll?${new URLSearchParams({ user_id: String(s.id), name: s.name, roll_no: s.roll_no, class_id: String(s.class_id) })}`;
  const flagged = students.data?.filter((s) => s.needs_reenroll).length ?? 0;

  return (
    <>
      <PageHeader
        title="Students"
        subtitle="Enrolled students, their face data and consent"
        actions={
          <>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Filter by class">
              <option value="">All classes</option>
              {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Link className="btn" href="/enroll"><ScanFace size={17} /> Enroll student</Link>
          </>
        }
      />
      {(message || students.error) && <div className={`alert ${message?.kind ?? "bad"}`}>{message?.text ?? students.error}</div>}
      {flagged > 0 && (
        <div className="alert warn">
          <RefreshCcw size={18} /> {flagged} student{flagged > 1 ? "s are" : " is"} matching with lower confidence lately (new glasses, beard or haircut?). Re-enroll them for reliable recognition.
        </div>
      )}

      <div className="card">
        {students.data?.length === 0 ? (
          <div className="empty">
            <EmptyArt />
            <h3>No students yet</h3>
            <p className="small">Enroll your first student. It takes about 30 seconds per person.</p>
            <Link className="btn sm" href="/enroll">Start enrolling</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Student</th><th>Class</th><th>Face data</th><th>Recent match</th><th>Consent</th><th /></tr>
              </thead>
              <tbody>
                {students.data?.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="person">
                        <Avatar name={s.name} />
                        <div><b>{s.name}</b><span>{s.roll_no}</span></div>
                      </div>
                    </td>
                    <td>{s.class_name}</td>
                    <td>
                      {s.face_deleted_at ? <span className="badge bad">Deleted</span>
                        : s.embeddings ? <span className="badge ok">{s.embeddings} templates</span>
                        : <span className="badge warn">Not scanned</span>}
                    </td>
                    <td>
                      {s.recent_confidence != null ? <span className="small">{(s.recent_confidence * 100).toFixed(0)}%</span> : <span className="muted">—</span>}{" "}
                      {s.needs_reenroll && <span className="badge warn">Re-enroll</span>}
                    </td>
                    <td className="small muted">{new Date(s.consent_at).toLocaleDateString()}</td>
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      <Link className="btn secondary sm" href={reenrollHref(s)}><RefreshCcw size={14} /> Re-enroll</Link>
                      {staff?.role === "admin" && (
                        <>
                          {" "}
                          {!s.face_deleted_at && s.embeddings > 0 && (
                            <button className="danger sm" onClick={() => deleteFace(s)} title="Delete face data (keeps attendance)"><Trash2 size={14} /> Face data</button>
                          )}{" "}
                          <button className="ghost sm" onClick={() => deleteStudent(s)} title="Remove student"><UserMinus size={15} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default function StudentsPage() {
  return (
    <Suspense>
      <StudentsInner />
    </Suspense>
  );
}
