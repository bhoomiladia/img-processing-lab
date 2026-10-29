"use client";

import { BarChart3, CalendarClock, LayoutDashboard, LogOut, School, ScanFace, Settings, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { Avatar, Logo } from "./Art";

const LINKS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/sessions", label: "Sessions", icon: CalendarClock },
  { href: "/enroll", label: "Enroll", icon: ScanFace },
  { href: "/students", label: "Students", icon: Users },
  { href: "/classes", label: "Classes", icon: School },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

/** Full-bleed routes render without the sidebar. */
const BARE = ["/login", "/signup", "/welcome", "/kiosk"];

export default function Shell({ children }: { children: ReactNode }) {
  const { staff, ready, signOut } = useAuth();
  const pathname = usePathname();

  if (BARE.some((p) => pathname.startsWith(p))) return <>{children}</>;
  if (!ready || !staff) return null;

  const links = staff.role === "admin" ? [...LINKS, { href: "/staff", label: "Staff", icon: UserCog }] : LINKS;
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <Logo />
          <div>
            Presently
            <small>Face attendance for classrooms</small>
          </div>
        </Link>
        {links.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`nav-link ${active(href) ? "active" : ""}`} title={label}>
            <Icon size={19} />
            <span>{label}</span>
          </Link>
        ))}
        <div className="spacer" />
        <Link href="/account" className={`nav-link ${active("/account") ? "active" : ""}`} title="Account">
          <Settings size={19} />
          <span>Account</span>
        </Link>
        <div className="user-card">
          <Avatar name={staff.name} />
          <div className="who">
            <b>{staff.name}</b>
            <span>{staff.role}</span>
          </div>
          <button className="ghost sm" onClick={signOut} title="Sign out" aria-label="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}
