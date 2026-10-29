import type { NextRequest } from "next/server";

/**
 * Same-origin proxy to the ML/API service, for hosts without a reverse proxy (e.g. Render).
 * Set API_INTERNAL_URL at runtime ("host:port" or a full URL). Behind Caddy, /api never reaches here.
 */
export const dynamic = "force-dynamic";

const FORWARD_REQUEST = ["authorization", "content-type", "accept"];
const FORWARD_RESPONSE = ["content-type", "content-disposition"];

function upstream(): string | null {
  const raw = process.env.API_INTERNAL_URL;
  if (!raw) return null;
  return (/^https?:\/\//.test(raw) ? raw : `http://${raw}`).replace(/\/$/, "");
}

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const base = upstream();
  if (!base) return Response.json({ detail: "API_INTERNAL_URL is not configured on the web service" }, { status: 502 });

  const { path } = await params;
  const headers = new Headers();
  for (const h of FORWARD_REQUEST) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  let res: Response;
  try {
    res = await fetch(`${base}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // Stream uploads (camera frames) straight through.
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
      cache: "no-store",
    } as RequestInit);
  } catch {
    return Response.json({ detail: "The attendance service is starting up or unreachable. Try again in a moment." }, { status: 503 });
  }

  const out = new Headers();
  for (const h of FORWARD_RESPONSE) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: out });
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT };
