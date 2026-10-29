/** Inline SVG illustrations. Colours come from the CSS tokens so they stay on-theme. */

function Face({ cx, cy, r, turn = 0 }: { cx: number; cy: number; r: number; turn?: number }) {
  const dx = turn * r * 0.28;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="var(--skin)" />
      <path
        d={`M${cx - r} ${cy - r * 0.05} C${cx - r * 1.05} ${cy - r * 1.25} ${cx + r * 1.05} ${cy - r * 1.3} ${cx + r} ${cy - r * 0.1} C${cx + r * 0.55} ${cy - r * 0.62} ${cx - r * 0.35} ${cy - r * 0.75} ${cx - r} ${cy - r * 0.05}Z`}
        fill="var(--hair)"
      />
      <circle cx={cx - r * 0.36 + dx} cy={cy + r * 0.12} r={r * 0.08} fill="var(--hair)" />
      <circle cx={cx + r * 0.36 + dx} cy={cy + r * 0.12} r={r * 0.08} fill="var(--hair)" />
      <path d={`M${cx - r * 0.28 + dx} ${cy + r * 0.48} Q${cx + dx} ${cy + r * 0.7} ${cx + r * 0.28 + dx} ${cy + r * 0.48}`} stroke="var(--hair)" strokeWidth={r * 0.07} fill="none" strokeLinecap="round" />
      <ellipse cx={cx - r * 0.62 + dx} cy={cy + r * 0.38} rx={r * 0.13} ry={r * 0.08} fill="#f29b8b" opacity="0.55" />
      <ellipse cx={cx + r * 0.62 + dx} cy={cy + r * 0.38} rx={r * 0.13} ry={r * 0.08} fill="#f29b8b" opacity="0.55" />
    </g>
  );
}

function Check({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="var(--teal)" />
      <path d={`M${cx - r * 0.42} ${cy + r * 0.02} L${cx - r * 0.1} ${cy + r * 0.34} L${cx + r * 0.45} ${cy - r * 0.3}`} stroke="#fff" strokeWidth={r * 0.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function Corners({ x, y, w, h, len = 18 }: { x: number; y: number; w: number; h: number; len?: number }) {
  const s = { stroke: "var(--primary)", strokeWidth: 4, fill: "none", strokeLinecap: "round" as const };
  return (
    <g>
      <path d={`M${x} ${y + len} V${y + 6} Q${x} ${y} ${x + 6} ${y} H${x + len}`} {...s} />
      <path d={`M${x + w - len} ${y} H${x + w - 6} Q${x + w} ${y} ${x + w} ${y + 6} V${y + len}`} {...s} />
      <path d={`M${x} ${y + h - len} V${y + h - 6} Q${x} ${y + h} ${x + 6} ${y + h} H${x + len}`} {...s} />
      <path d={`M${x + w - len} ${y + h} H${x + w - 6} Q${x + w} ${y + h} ${x + w} ${y + h - 6} V${y + h - len}`} {...s} />
    </g>
  );
}

/** Large hero: a phone-style scanner recognising a student, with a "marked present" card. */
export function HeroArt({ width = 420 }: { width?: number }) {
  return (
    <svg viewBox="0 0 420 340" width={width} style={{ maxWidth: "100%", height: "auto" }} role="img" aria-label="A student's face being scanned and marked present">
      <defs>
        <linearGradient id="scanGrad" x1="0" x2="1">
          <stop offset="0" stopColor="#4fe0b8" stopOpacity="0" />
          <stop offset="0.5" stopColor="#4fe0b8" />
          <stop offset="1" stopColor="#4fe0b8" stopOpacity="0" />
        </linearGradient>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#2b208c" floodOpacity="0.14" />
        </filter>
      </defs>
      <circle cx="215" cy="175" r="150" fill="#fff" opacity="0.55" />
      <circle cx="350" cy="60" r="10" fill="var(--peach)" opacity="0.8" />
      <circle cx="60" cy="90" r="6" fill="var(--primary)" opacity="0.5" />
      <circle cx="380" cy="250" r="5" fill="var(--teal)" />
      <g filter="url(#soft)">
        <rect x="130" y="30" width="170" height="280" rx="28" fill="#fff" />
      </g>
      <rect x="142" y="44" width="146" height="200" rx="18" fill="var(--primary-soft)" />
      <path d="M160 244 C165 205 190 192 215 192 C240 192 265 205 270 244 Z" fill="var(--primary)" />
      <rect x="205" y="178" width="20" height="18" fill="var(--skin)" />
      <Face cx={215} cy={140} r={42} />
      <Corners x={160} y={86} w={110} h={112} />
      <rect x="166" y="150" width="98" height="3" rx="2" fill="url(#scanGrad)">
        <animate attributeName="y" values="96;188;96" dur="2.6s" repeatCount="indefinite" />
      </rect>
      <rect x="165" y="262" width="100" height="10" rx="5" fill="var(--surface-2)" />
      <rect x="185" y="282" width="60" height="10" rx="5" fill="var(--primary)" opacity="0.85" />

      <g className="float" filter="url(#soft)">
        <rect x="250" y="210" width="150" height="62" rx="16" fill="#fff" />
        <Check cx={278} cy={241} r={15} />
        <rect x="302" y="229" width="78" height="9" rx="4.5" fill="var(--text)" opacity="0.85" />
        <rect x="302" y="245" width="52" height="8" rx="4" fill="var(--muted)" opacity="0.4" />
      </g>
      <g className="float" style={{ animationDelay: "1.2s" }} filter="url(#soft)">
        <rect x="10" y="150" width="140" height="78" rx="16" fill="#fff" />
        <text x="26" y="178" fontSize="12" fontWeight="700" fill="var(--muted)" fontFamily="inherit">Present</text>
        <text x="26" y="208" fontSize="24" fontWeight="800" fill="var(--text)" fontFamily="inherit">42/45</text>
        <rect x="116" y="190" width="8" height="22" rx="3" fill="var(--teal)" />
        <rect x="128" y="180" width="8" height="32" rx="3" fill="var(--primary)" />
      </g>
    </svg>
  );
}

/** A face with arrows in four directions: multi-angle enrollment. */
export function EnrollArt({ size = 140 }: { size?: number }) {
  const arrow = (d: string) => <path d={d} stroke="var(--primary)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  return (
    <svg viewBox="0 0 160 130" width={size} role="img" aria-label="Face scanned from five angles">
      <circle cx="80" cy="65" r="52" fill="none" stroke="#c9c1fb" strokeWidth="2" strokeDasharray="5 6" />
      <Face cx={80} cy={68} r={30} turn={0.4} />
      {arrow("M18 57 l-8 8 8 8")}
      {arrow("M142 57 l8 8 -8 8")}
      {arrow("M72 15 l8 -8 8 8")}
      {arrow("M72 115 l8 8 8 -8")}
      <circle cx="128" cy="24" r="6" fill="var(--teal)" />
      <circle cx="30" cy="110" r="4" fill="var(--peach)" />
    </svg>
  );
}

/** A calendar card with a clock: scheduling sessions. */
export function SessionArt({ size = 140 }: { size?: number }) {
  return (
    <svg viewBox="0 0 160 130" width={size} role="img" aria-label="Calendar with a scheduled class">
      <rect x="22" y="18" width="104" height="96" rx="14" fill="#fff" stroke="var(--border)" strokeWidth="2" />
      <path d="M22 32 a14 14 0 0 1 14 -14 h76 a14 14 0 0 1 14 14 v12 h-104 z" fill="var(--primary)" />
      <rect x="44" y="10" width="6" height="18" rx="3" fill="var(--hair)" />
      <rect x="98" y="10" width="6" height="18" rx="3" fill="var(--hair)" />
      {[0, 1, 2, 3].map((c) =>
        [0, 1, 2].map((r) => (
          <rect key={`${c}${r}`} x={36 + c * 21} y={56 + r * 17} width="13" height="10" rx="3" fill={c === 1 && r === 1 ? "var(--peach)" : "var(--surface-2)"} />
        )),
      )}
      <circle cx="120" cy="96" r="26" fill="#fff" stroke="var(--teal)" strokeWidth="4" />
      <path d="M120 82 v14 l9 6" stroke="var(--hair)" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** A kiosk screen recognising a student. */
export function KioskArt({ size = 140 }: { size?: number }) {
  return (
    <svg viewBox="0 0 160 130" width={size} role="img" aria-label="Attendance kiosk recognising a student">
      <rect x="18" y="12" width="124" height="84" rx="12" fill="var(--hair)" />
      <rect x="25" y="19" width="110" height="70" rx="7" fill="var(--primary-soft)" />
      <path d="M58 89 C60 72 70 66 80 66 C90 66 100 72 102 89 Z" fill="var(--primary)" />
      <Face cx={80} cy={50} r={17} />
      <Corners x={59} y={28} w={42} h={46} len={9} />
      <rect x="72" y="96" width="16" height="14" fill="var(--muted)" />
      <rect x="54" y="110" width="52" height="7" rx="3.5" fill="var(--muted)" />
      <Check cx={132} cy={20} r={14} />
    </svg>
  );
}

/** A webcam on a stand: device check. */
export function CameraArt({ size = 120 }: { size?: number }) {
  return (
    <svg viewBox="0 0 140 120" width={size} role="img" aria-label="Webcam">
      <ellipse cx="70" cy="110" rx="34" ry="6" fill="var(--surface-2)" />
      <path d="M70 80 v24" stroke="var(--muted)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="70" cy="48" r="38" fill="#fff" stroke="var(--border)" strokeWidth="3" />
      <circle cx="70" cy="48" r="24" fill="var(--hair)" />
      <circle cx="70" cy="48" r="13" fill="var(--primary)" />
      <circle cx="64" cy="42" r="5" fill="#fff" opacity="0.8" />
      <circle cx="104" cy="20" r="5" fill="var(--teal)" />
    </svg>
  );
}

/** A clipboard: empty states. */
export function EmptyArt({ size = 120 }: { size?: number }) {
  return (
    <svg viewBox="0 0 140 120" width={size} role="img" aria-hidden="true">
      <circle cx="70" cy="62" r="50" fill="var(--primary-soft)" />
      <rect x="40" y="22" width="60" height="78" rx="10" fill="#fff" stroke="var(--border)" strokeWidth="2" />
      <rect x="56" y="16" width="28" height="12" rx="6" fill="var(--primary)" />
      <rect x="50" y="44" width="40" height="6" rx="3" fill="var(--surface-2)" />
      <rect x="50" y="58" width="32" height="6" rx="3" fill="var(--surface-2)" />
      <rect x="50" y="72" width="36" height="6" rx="3" fill="var(--surface-2)" />
      <path d="M112 26 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="var(--peach)" />
    </svg>
  );
}

/** Brand mark. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b6cf0" />
          <stop offset="1" stopColor="#4a3bc4" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#logoGrad)" />
      <circle cx="20" cy="17" r="6.5" fill="none" stroke="#fff" strokeWidth="2.6" />
      <path d="M9.5 31c2-4.6 5.9-7 10.5-7s8.5 2.4 10.5 7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="31" cy="10" r="4.5" fill="#4fe0b8" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

const AVATAR_COLORS = ["#5b4bdb", "#11a389", "#e07a3f", "#2470c9", "#c2418f", "#7a5af8", "#0f8fa8"];

export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  const color = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span className="avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </span>
  );
}
