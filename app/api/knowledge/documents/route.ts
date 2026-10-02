import { NextRequest, NextResponse } from "next/server";
import { currentSession, rejectCrossOriginWrite, unauthorized } from "@/lib/auth";
import { allowAiRequest, allowProviderWork } from "@/lib/ai-rate-limit";
import { aiErrorResponse, aiFailure, aiHeaders } from "@/lib/ai-http";
import { AiProviderError, embed, type AiEmbedding } from "@/lib/ai-provider";
import { chunkKnowledgeText, KnowledgeLimitError, maxKnowledgeContent } from "@/lib/knowledge-chunks";
import { embeddingDimension, vectorLiteral } from "@/lib/knowledge-vector";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let session;
  try { session = await currentSession(request); } catch { return aiFailure(503, "认证服务暂时不可用。"); }
  if (!session) return unauthorized();
  try {
    const documents = await prisma.knowledgeDocument.findMany({
      where: { ownerId: session.user.id }, orderBy: { createdAt: "desc" }, take: 30,
      select: { id: true, title: true, status: true, createdAt: true,
        chunks: { orderBy: { position: "asc" }, select: { position: true, content: true, embeddingModel: true, embeddingDimension: true } } },
    });
    return NextResponse.json({ ok: true, documents: documents.map(document => ({
      id: document.id, title: document.title, status: document.status, createdAt: document.createdAt,
      chunkCount: document.chunks.length,
      model: document.chunks[0]?.embeddingModel ?? null,
      dimension: document.chunks[0]?.embeddingDimension ?? null,
      chunks: document.chunks.map(chunk => ({ position: chunk.position, preview: chunk.content.slice(0, 100) })),
    })) }, { headers: aiHeaders });
  } catch { return aiFailure(503, "资料列表暂时不可用。"); }
}

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOriginWrite(request);
  if (rejected) return rejected;
  let session;
  try { session = await currentSession(request); } catch { return aiFailure(503, "认证服务暂时不可用。"); }
  if (!session) return unauthorized();
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return aiFailure(400, "请发送 JSON 格式的资料。");
  let body: unknown;
  try { body = await request.json(); } catch { return aiFailure(400, "JSON 格式不正确。"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return aiFailure(400, "请填写资料标题和内容。");
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !["title", "content"].includes(key))) return aiFailure(400, "只接受标题和内容；用户和向量由服务端管理。");
  if (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 100) return aiFailure(400, "标题需为 1～100 个字符。");
  if (typeof input.content !== "string" || !input.content.trim() || input.content.trim().length > maxKnowledgeContent) return aiFailure(400, "内容需为 1～6000 个字符。");
  let chunks: string[];
  try { chunks = chunkKnowledgeText(input.content); }
  catch (error) { return aiFailure(400, error instanceof KnowledgeLimitError && error.code === "CHUNKS" ? "最多可生成 8 个分块，请缩短或合并段落。" : "资料内容不符合限制。"); }
  if (!allowAiRequest(session.user.id)) return aiFailure(429, "请求太频繁，请一分钟后再试。");
  try {
    if (!allowProviderWork(session.user.id, chunks.length)) return aiFailure(429, "本分钟模型调用预算已用完，请稍后再试。");
  } catch (error) { return aiErrorResponse(error); }

  let documentId: number;
  try {
    const document = await prisma.knowledgeDocument.create({ data: { ownerId: session.user.id, title: input.title.trim(), content: input.content.trim(), status: "indexing" } });
    documentId = document.id;
  } catch { return aiFailure(503, "资料暂时无法保存。"); }

  const deadline = AbortSignal.timeout(75_000);
  try {
    // External calls happen outside the short database transaction.
    const embeddings: AiEmbedding[] = [];
    for (const chunk of chunks) embeddings.push(await embed(chunk, { signal: deadline }));
    if (deadline.aborted) throw new AiProviderError("TIMEOUT");
    await prisma.$transaction(async transaction => {
      for (let position = 0; position < chunks.length; position++) {
        const result = embeddings[position];
        const literal = vectorLiteral(result.vector);
        await transaction.$executeRaw`
          INSERT INTO "KnowledgeChunk" ("documentId", "position", "content", "embedding", "embeddingModel", "embeddingDimension")
          VALUES (${documentId}, ${position}, ${chunks[position]}, ${literal}::vector, ${result.model}, ${embeddingDimension})
        `;
      }
      await transaction.knowledgeDocument.update({ where: { id: documentId }, data: { status: "ready" } });
    });
    return NextResponse.json({ ok: true, id: documentId, status: "ready", kind: embeddings[0].kind,
      chunkCount: chunks.length, model: embeddings[0].model, dimension: embeddingDimension,
      usage: embeddings.reduce((total, item) => total === null || item.usage === null ? null : total + item.usage.totalTokens, 0 as number | null),
    }, { status: 201, headers: aiHeaders });
  } catch (error) {
    await prisma.knowledgeDocument.update({ where: { id: documentId }, data: { status: "failed" } }).catch(() => {});
    return aiErrorResponse(deadline.aborted ? new AiProviderError("TIMEOUT") : error);
  }
}
