import { NextRequest, NextResponse } from "next/server";
import { tags } from "@/lib/resources";
import { prisma } from "@/lib/prisma";
import { currentSession, rejectCrossOriginWrite, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

const allowedTags = tags.filter((tag) => tag !== "全部");

function invalid(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

function unavailable() {
  return NextResponse.json(
    { ok: false, error: "数据库暂时不可用，请检查连接后重试。" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  try {
    const session = await currentSession(request);
    if (!session) return unauthorized();
    const resources = await prisma.resource.findMany({ where: { ownerId: session.user.id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ ok: true, resources }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("读取资料失败：", error instanceof Error ? error.name : "unknown");
    return unavailable();
  }
}

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOriginWrite(request);
  if (rejected) return rejected;
  let session;
  try {
    session = await currentSession(request);
    if (!session) return unauthorized();
  } catch {
    return unavailable();
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return invalid("请发送 JSON 格式的资料。");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalid("请求中的 JSON 格式不正确。");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return invalid("请发送一条包含标题、简介和分类的资料。");
  }

  const input = body as Record<string, unknown>;
  if ("ownerId" in input || "owner" in input || "userId" in input) return invalid("资料归属由服务端决定，不能在请求中指定。");
  if (typeof input.title !== "string") return invalid("资料标题必须是文字。");
  const title = input.title.trim();
  if (!title) return invalid("请填写资料标题。");
  if (title.length > 100) return invalid("资料标题不能超过 100 个字。");

  if (typeof input.desc !== "string") return invalid("简介必须是文字。");
  const desc = input.desc.trim();
  if (!desc) return invalid("请填写资料简介。");
  if (desc.length > 500) return invalid("资料简介不能超过 500 个字。");

  if (typeof input.tag !== "string" || !allowedTags.includes(input.tag)) {
    return invalid("请选择已有的资料分类，不能选择“全部”。");
  }

  try {
    const resource = await prisma.resource.create({ data: { title, desc, tag: input.tag, ownerId: session.user.id } });
    return NextResponse.json({
      ok: true,
      status: "saved",
      saved: true,
      resource,
      message: "资料已保存到数据库。",
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("保存资料失败：", error instanceof Error ? error.name : "unknown");
    return unavailable();
  }
}
