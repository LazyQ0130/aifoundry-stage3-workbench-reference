import { NextRequest, NextResponse } from "next/server";
import { createSession, invalidCredentials, publicUser, readCredentials, rejectCrossOriginWrite, setSessionCookie, unavailable, validPassword, validUsername } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOriginWrite(request);
  if (rejected) return rejected;
  const input = await readCredentials(request);
  if (!input || !validUsername(input.username) || !validPassword(input.password)) return invalidCredentials();
  try {
    const user = await prisma.user.findUnique({ where: { username: input.username } });
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) return invalidCredentials();
    const token = await createSession(user.id);
    return setSessionCookie(NextResponse.json({ ok: true, user: publicUser(user) }, { headers: { "Cache-Control": "no-store" } }), token);
  } catch (error) {
    console.error("登录失败：", error instanceof Error ? error.name : "unknown");
    return unavailable();
  }
}
