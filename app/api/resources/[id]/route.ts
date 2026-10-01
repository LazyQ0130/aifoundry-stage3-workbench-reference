import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { tags } from "@/lib/resources";
import { prisma } from "@/lib/prisma";
import { currentSession, rejectCrossOriginWrite, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const allowedTags = tags.filter((tag) => tag !== "全部");
const headers = { "Cache-Control": "no-store" };

function errorResponse(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers });
}

async function resourceId(context: Context) {
  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id)) return null;
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) && parsed <= 2147483647 ? parsed : null;
}

function missing(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export async function PATCH(request: NextRequest, context: Context) {
  const rejected = rejectCrossOriginWrite(request);
  if (rejected) return rejected;
  let session;
  try {
    session = await currentSession(request);
    if (!session) return unauthorized();
  } catch {
    return errorResponse(503, "认证服务暂时不可用，请稍后重试。");
  }
  const id = await resourceId(context);
  if (id === null) return errorResponse(400, "资料 ID 必须是合法正整数。");
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return errorResponse(400, "请发送 JSON 格式的资料。");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "请求中的 JSON 格式不正确。");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse(400, "请发送一条包含标题、简介、分类和重要状态的资料。");
  }

  const input = body as Record<string, unknown>;
  if ("ownerId" in input || "owner" in input || "userId" in input) return errorResponse(400, "资料归属不能通过请求修改。");
  if (typeof input.title !== "string") return errorResponse(400, "资料标题必须是文字。");
  const title = input.title.trim();
  if (!title) return errorResponse(400, "请填写资料标题。");
  if (title.length > 100) return errorResponse(400, "资料标题不能超过 100 个字。");
  if (typeof input.desc !== "string") return errorResponse(400, "简介必须是文字。");
  const desc = input.desc.trim();
  if (!desc) return errorResponse(400, "请填写资料简介。");
  if (desc.length > 500) return errorResponse(400, "资料简介不能超过 500 个字。");
  if (typeof input.tag !== "string" || !allowedTags.includes(input.tag)) {
    return errorResponse(400, "请选择已有的资料分类，不能选择“全部”。");
  }
  if (typeof input.important !== "boolean") {
    return errorResponse(400, "重要状态必须是 true 或 false。");
  }

  try {
    const resource = await prisma.resource.update({
      where: { id, ownerId: session.user.id },
      data: { title, desc, tag: input.tag, important: input.important },
    });
    return NextResponse.json({ ok: true, resource }, { status: 200, headers });
  } catch (error) {
    if (missing(error)) return errorResponse(404, "这条资料不存在，请重新读取列表。");
    console.error("修改资料失败：", error instanceof Error ? error.name : "unknown");
    return errorResponse(503, "数据库暂时不可用，请检查连接后重试。");
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const rejected = rejectCrossOriginWrite(request);
  if (rejected) return rejected;
  let session;
  try {
    session = await currentSession(request);
    if (!session) return unauthorized();
  } catch {
    return errorResponse(503, "认证服务暂时不可用，请稍后重试。");
  }
  const id = await resourceId(context);
  if (id === null) return errorResponse(400, "资料 ID 必须是合法正整数。");

  try {
    const deleted = await prisma.resource.delete({ where: { id, ownerId: session.user.id } });
    return NextResponse.json({ ok: true, deletedId: deleted.id }, { status: 200, headers });
  } catch (error) {
    if (missing(error)) return errorResponse(404, "这条资料不存在，请重新读取列表。");
    console.error("删除资料失败：", error instanceof Error ? error.name : "unknown");
    return errorResponse(503, "数据库暂时不可用，请检查连接后重试。");
  }
}
