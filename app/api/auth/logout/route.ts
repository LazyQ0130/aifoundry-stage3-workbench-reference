import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, rejectCrossOriginWrite, requestToken, tokenHash, unavailable } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOriginWrite(request);
  if (rejected) return rejected;
  const token = requestToken(request);
  try {
    if (token) await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
    return clearSessionCookie(NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }));
  } catch (error) {
    console.error("退出登录失败：", error instanceof Error ? error.name : "unknown");
    return unavailable();
  }
}
