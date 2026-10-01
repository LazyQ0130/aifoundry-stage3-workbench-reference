import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { invalid, publicUser, readCredentials, rejectCrossOriginWrite, sessionSeconds, setSessionCookie, tokenHash, unavailable, validPassword, validUsername } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOriginWrite(request);
  if (rejected) return rejected;
  const input = await readCredentials(request);
  if (!input || !validUsername(input.username)) return invalid("用户名需为 3–24 位字母、数字或下划线。");
  if (!validPassword(input.password)) return invalid("密码需为 8–128 个字符。");
  const username = input.username;
  try {
    const passwordHash = await hashPassword(input.password);
    const token = randomBytes(32).toString("base64url");
    const user = await prisma.$transaction(async (transaction) => {
      const created = await transaction.user.create({ data: { username, passwordHash } });
      await transaction.session.create({ data: {
        userId: created.id,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + sessionSeconds * 1000),
      } });
      return created;
    });
    return setSessionCookie(NextResponse.json({ ok: true, user: publicUser(user) }, { status: 201, headers: { "Cache-Control": "no-store" } }), token);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: false, error: "这个用户名已被使用。" }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    console.error("注册失败：", error instanceof Error ? error.name : "unknown");
    return unavailable();
  }
}
