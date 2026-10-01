import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const sessionCookie = "aifoundry_session";
export const sessionSeconds = 7 * 24 * 60 * 60;
const noStore = { "Cache-Control": "no-store" };

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function publicUser(user: { id: number; username: string; createdAt: Date }) {
  return { id: user.id, username: user.username, createdAt: user.createdAt };
}

export function invalidCredentials() {
  return NextResponse.json({ ok: false, error: "用户名或密码不正确。" }, { status: 401, headers: noStore });
}

export function unauthorized() {
  return NextResponse.json({ ok: false, error: "请先登录，再访问数据库资料。" }, { status: 401, headers: noStore });
}

// Browser writes carry Origin or Fetch Metadata. Reject another origin before reading a body.
export function rejectCrossOriginWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if ((origin && origin !== request.nextUrl.origin) || site === "cross-site" || site === "same-site") {
    return NextResponse.json({ ok: false, error: "只接受同源页面发起的写入请求。" }, { status: 403, headers: noStore });
  }
  return null;
}

export function unavailable() {
  return NextResponse.json({ ok: false, error: "认证服务暂时不可用，请稍后重试。" }, { status: 503, headers: noStore });
}

export function invalid(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400, headers: noStore });
}

export async function readCredentials(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return null;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const input = body as Record<string, unknown>;
    return { username: input.username, password: input.password };
  } catch {
    return null;
  }
}

export function validUsername(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_]{3,24}$/.test(value);
}

export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: {
    userId,
    tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + sessionSeconds * 1000),
  } });
  return token;
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(sessionCookie, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: sessionSeconds,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(sessionCookie, "", {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 0,
  });
  return response;
}

export function requestToken(request: NextRequest) {
  const token = request.cookies.get(sessionCookie)?.value;
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export async function currentSession(request: NextRequest) {
  const token = requestToken(request);
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: true } });
  if (!session || session.expiresAt <= new Date()) return null;
  return session;
}
