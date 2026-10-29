/** Live head-pose indicator: the dot shows where the head points, the box is the target zone. */
export default function PosePad({
  yaw,
  pitch,
  target,
  active,
}: {
  yaw: number;
  pitch: number;
  target: [number, number, number, number];
  active: boolean;
}) {
  const SIZE = 150;
  const RANGE = 45;
  // Mirror yaw so turning to your left moves the dot left, like the mirrored video.
  const x = (deg: number) => SIZE / 2 - (Math.max(-RANGE, Math.min(RANGE, deg)) / RANGE) * (SIZE / 2);
  const y = (deg: number) => SIZE / 2 - (Math.max(-RANGE, Math.min(RANGE, deg)) / RANGE) * (SIZE / 2);
  const [y0, y1, p0, p1] = target;
  const inside = active && yaw >= y0 && yaw <= y1 && pitch >= p0 && pitch <= p1;
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Head position guide"
      style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8 }}>
      <line x1={SIZE / 2} y1={0} x2={SIZE / 2} y2={SIZE} stroke="var(--border)" />
      <line x1={0} y1={SIZE / 2} x2={SIZE} y2={SIZE / 2} stroke="var(--border)" />
      <rect x={x(y1)} y={y(p1)} width={x(y0) - x(y1)} height={y(p0) - y(p1)}
        fill="var(--ok-bg)" stroke="var(--ok)" strokeDasharray="4 3" rx={4} />
      {active && <circle cx={x(yaw)} cy={y(pitch)} r={7} fill={inside ? "var(--ok)" : "var(--accent)"} />}
    </svg>
  );
}
