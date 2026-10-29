"use client";

import { ArrowRight, CalendarClock, CheckCircle2, ScanFace, School, Users } from "lucide-react";
import Link from "next/link";
import { EmptyArt, HeroArt } from "@/components/Art";
import SetupChecklist, { checklistItems } from "@/components/SetupChecklist";
import { PageHeader } from "@/components/Shell";
import type { Overview, SessionRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/useLoad";
import SessionList from "@/components/SessionList";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function HomePage() {
  const { staff } = useAuth();
  const overview = useLoad<Overview>("/overview");
  const sessions = useLoad<SessionRow[]>("/sessions?limit=8");
  if (!staff) return null;

  const o = overview.data;
  const setupDone = o ? checklistItems(o, staff).every((i) => i.done) : true;
  const today = new Date().toDateString();
  const todays = sessions.data?.filter((s) => new Date(s.start_time).toDateString() === today) ?? [];

  const stats = o && [
    { label: "Classes", value: o.classes, icon: School, tone: "tone-primary" },
    { label: "Students enrolled", value: `${o.students_with_face}/${o.students}`, icon: Users, tone: "tone-sky" },
    { label: "Sessions today", value: o.sessions_today, icon: CalendarClock, tone: "tone-peach" },
    { label: "Marked present today", value: o.marked_today, icon: CheckCircle2, tone: "tone-teal" },
  ];

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${staff.name.split(" ")[0]}`}
        subtitle={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        actions={
          <>
            <Link className="btn secondary" href="/enroll"><ScanFace size={17} /> Enroll student</Link>
            <Link className="btn" href="/sessions"><CalendarClock size={17} /> New session</Link>
          </>
        }
      />

      {staff.role === "admin" && o && o.pending_staff > 0 && (
        <div className="alert warn" style={{ alignItems: "center" }}>
          <span style={{ flex: 1 }}>{o.pending_staff} teacher sign-up request{o.pending_staff > 1 ? "s are" : " is"} waiting for your approval.</span>
          <Link className="btn sm" href="/staff">Review</Link>
        </div>
      )}

      {stats && (
        <div className="stats">
          {stats.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="stat">
              <div className={`icon-tile ${tone}`}><Icon size={22} /></div>
              <div>
                <div className="value">{value}</div>
                <div className="label">{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            <h2>Today&apos;s sessions</h2>
            <Link href="/sessions" className="small">All sessions <ArrowRight size={14} style={{ verticalAlign: "-2px" }} /></Link>
          </div>
          {todays.length ? (
            <SessionList sessions={todays} />
          ) : (
            <div className="empty">
              <EmptyArt />
              <h3>No sessions today</h3>
              <p className="small">Schedule your lecture and open the kiosk when class starts.</p>
              <Link className="btn sm" href="/sessions">Schedule a session</Link>
            </div>
          )}
        </div>

        {o && !setupDone ? (
          <div className="card">
            <div className="card-title"><h2>Getting started</h2></div>
            <SetupChecklist overview={o} staff={staff} compact />
          </div>
        ) : (
          <div className="card" style={{ background: "linear-gradient(160deg, #efeaff, #e6f6f3)", textAlign: "center" }}>
            <HeroArt width={300} />
            <h3>Attendance in seconds</h3>
            <p className="small muted">Open the kiosk at the start of class and let students check in one by one.</p>
          </div>
        )}
      </div>
    </>
  );
}
