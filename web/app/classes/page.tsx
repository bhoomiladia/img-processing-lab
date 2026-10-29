"use client";

import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { EmptyArt } from "@/components/Art";
import { PageHeader } from "@/components/Shell";
import { api, errorMessage, type ClassRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/useLoad";

const TONES = ["tone-primary", "tone-teal", "tone-peach", "tone-sky"];

export default function ClassesPage() {
  const { staff } = useAuth();
  const classes = useLoad<ClassRow[]>("/classes");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/classes", { json: { name } });
      setName("");
      classes.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader title="Classes" subtitle="Students belong to a class; sessions are scheduled per class" />
      {(error || classes.error) && <div className="alert bad">{error || classes.error}</div>}

      {staff?.role === "admin" && (
        <form className="card row" onSubmit={create}>
          <label style={{ flex: 1, minWidth: 200 }}>
            New class name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CSE-A 2nd year" required />
          </label>
          <button><Plus size={17} /> Add class</button>
        </form>
      )}

      {classes.data?.length === 0 ? (
        <div className="card empty">
          <EmptyArt />
          <h3>No classes yet</h3>
          <p className="small">{staff?.role === "admin" ? "Add your first class above." : "Your admin hasn't created any classes yet."}</p>
        </div>
      ) : (
        <div className="grid">
          {classes.data?.map((c, i) => (
            <div key={c.id} className="card class-card" style={{ margin: 0 }}>
              <div className={`icon-tile ${TONES[i % TONES.length]}`}>{c.name.slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <h3>{c.name}</h3>
                <span className="small muted"><Users size={14} style={{ verticalAlign: "-2px" }} /> {c.students} student{c.students === 1 ? "" : "s"}</span>
              </div>
              <Link className="btn secondary sm" href={`/students?class_id=${c.id}`}>View</Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
