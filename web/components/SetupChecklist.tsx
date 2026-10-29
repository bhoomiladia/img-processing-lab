"use client";

import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Overview, Staff } from "@/lib/api";

type Item = { title: string; detail: string; done: boolean; href?: string; cta: string };

export function checklistItems(o: Overview, staff: Staff): Item[] {
  const items: Item[] = [
    staff.role === "admin"
      ? { title: "Create your first class", detail: "Add a class like “CSE-A” that students belong to.", done: o.classes > 0, href: "/classes", cta: "Add class" }
      : {
          title: "Find your class",
          detail: o.classes > 0 ? "Your admin has set up classes for you." : "Ask your admin to create your class. It will appear here.",
          done: o.classes > 0,
          cta: "Waiting on admin",
        },
    { title: "Enroll your students", detail: "Each student does a 30-second guided face scan from 5 angles.", done: o.students_with_face > 0, href: "/enroll", cta: "Enroll" },
    { title: "Schedule a session", detail: "Pick the class, subject and time of your lecture.", done: o.my_sessions > 0, href: "/sessions", cta: "Schedule" },
    { title: "Take attendance on the kiosk", detail: "Open the kiosk and let students look at the camera one by one.", done: o.my_marks > 0, href: "/sessions", cta: "Open sessions" },
  ];
  if (staff.role === "admin")
    items.push({ title: "Invite a teacher", detail: "Create accounts so teachers can run their own sessions.", done: o.teachers > 0, href: "/staff", cta: "Invite" });
  return items;
}

export default function SetupChecklist({ overview, staff, compact = false }: { overview: Overview; staff: Staff; compact?: boolean }) {
  const items = checklistItems(overview, staff);
  const done = items.filter((i) => i.done).length;
  return (
    <div className="stack">
      <div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
          <b className="small">{done} of {items.length} complete</b>
          <span className="small muted">{Math.round((done / items.length) * 100)}%</span>
        </div>
        <div className="bar teal"><div style={{ width: `${(done / items.length) * 100}%` }} /></div>
      </div>
      <div className="checklist">
        {items.map((item) => (
          <div key={item.title} className={`check-item ${item.done ? "done" : ""}`}>
            <span className="tick"><Check size={16} strokeWidth={3} /></span>
            <div className="grow">
              <div className="title">{item.title}</div>
              {!compact && <div className="small muted">{item.detail}</div>}
            </div>
            {!item.done &&
              (item.href ? (
                <Link className="btn secondary sm" href={item.href}>
                  {item.cta} <ChevronRight size={15} />
                </Link>
              ) : (
                <span className="badge muted">{item.cta}</span>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
