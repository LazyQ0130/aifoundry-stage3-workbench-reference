import { NextRequest, NextResponse } from "next/server";
import { currentSession, publicUser, unauthorized, unavailable } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await currentSession(request);
    if (!session) return unauthorized();
    return NextResponse.json({ ok: true, user: publicUser(session.user) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("读取登录状态失败：", error instanceof Error ? error.name : "unknown");
    return unavailable();
  }
}
