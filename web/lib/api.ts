export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "attendance.token";
const STAFF_KEY = "attendance.staff";

export type Pose = "front" | "left" | "right" | "up" | "down";

export interface Staff {
  id: number;
  email: string;
  name: string;
  role: "admin" | "teacher";
  must_change_password: boolean;
  onboarded: boolean;
}

export interface Overview {
  classes: number;
  students: number;
  students_with_face: number;
  sessions: number;
  my_sessions: number;
  sessions_today: number;
  my_marks: number;
  marked_today: number;
  teachers: number;
  pending_staff: number;
}

export interface ClassRow {
  id: number;
  name: string;
  students: number;
}

export interface SessionRow {
  id: number;
  class_id: number;
  class_name: string;
  subject: string;
  start_time: string;
  end_time: string;
  present: number;
  total: number;
}

export interface RosterRow {
  user_id: number;
  name: string;
  roll_no: string;
  marked_at: string | null;
  confidence: number | null;
  method: "face" | "manual" | null;
  face_enrolled: boolean;
}

export interface StudentRow {
  id: number;
  name: string;
  roll_no: string;
  class_id: number;
  class_name: string;
  consent_at: string;
  face_deleted_at: string | null;
  embeddings: number;
  recent_confidence: number | null;
  recent_marks: number;
  needs_reenroll: boolean;
}

export interface ReportRow {
  user_id: number;
  name: string;
  roll_no: string;
  attended: number;
  total: number;
  percentage: number | null;
}

export interface EnrollFrameResult {
  accepted: boolean;
  status: "ok" | "no_face" | "multiple_faces" | "low_quality";
  issues: string[];
  counts: Record<Pose, number>;
  quality?: number;
}

export type RecognizeResult =
  | { status: "no_face" | "multiple_faces" | "low_quality"; issues: string[]; attempt_id: string | null }
  | { status: "unknown" | "wrong_class"; attempt_id: string | null }
  | { status: "verifying"; attempt_id: string; challenge: string; prompt: string; progress: number }
  | {
      status: "marked" | "already_marked";
      user: { id: number; name: string; roll_no: string };
      confidence: number;
    };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredStaff(): Staff | null {
  try {
    const raw = localStorage.getItem(STAFF_KEY);
    return raw ? (JSON.parse(raw) as Staff) : null;
  } catch {
    return null;
  }
}

export function storeSession(token: string, staff: Staff) {
  localStorage.setItem(TOKEN_KEY, token);
  storeStaff(staff);
}

export function storeStaff(staff: Staff) {
  try {
    localStorage.setItem(STAFF_KEY, JSON.stringify(staff));
  } catch {}
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(STAFF_KEY);
  } catch {}
}

type Options = { method?: string; json?: unknown; form?: FormData; raw?: boolean };

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
  });

  if (res.status === 401 && !path.startsWith("/auth/login")) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
  }
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = (await res.json()).detail;
    } catch {}
    const message =
      typeof detail === "string"
        ? detail
        : detail && typeof detail === "object" && "message" in detail
          ? String((detail as { message: unknown }).message)
          : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, detail);
  }
  if (opts.raw) return res as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
