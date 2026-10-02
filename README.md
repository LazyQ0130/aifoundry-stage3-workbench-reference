# AIFoundry Stage 3 Reference — AI 知识工作台

Stage 3.7 Implementation A 的独立生产参考产品。它延续 Stage 2 的账号、Session 和个人资料，加入真实 AI、结构化建议、流式回答、知识文档、pgvector 检索、RAG 与经服务端验证的引用。仓库只包含产品运行代码和最小可靠性测试，不包含课程正文与作者验收快照。

技术栈：Next.js 15、React 19、Prisma 6.19.3、PostgreSQL 17、pgvector。

## 环境变量

服务端 Secret：`DATABASE_URL`、`AI_CHAT_API_KEY`、`AI_EMBEDDING_API_KEY`。

服务端配置：`AI_PROVIDER_MODE=real`、`AI_CHAT_BASE_URL`、`AI_CHAT_MODEL=qwen3.7-flash`、`AI_CHAT_DISABLE_THINKING=1`、`AI_EMBEDDING_BASE_URL`、`AI_EMBEDDING_MODEL=text-embedding-v4`、`AI_EMBEDDING_DIMENSION=1024`、`AI_TIMEOUT_MS=20000`。不要为这些变量添加 `NEXT_PUBLIC_` 前缀。真实值仅配置在本地未跟踪 `.env` 或部署平台的 Production 环境中。

## 本地启动与 migration

使用 Node.js 20+ 和独立 PostgreSQL 数据库。先在本地 `.env` 配置变量，再运行：

```bash
npm install
npm test
npm run build
npx prisma migrate deploy
npx prisma migrate status
npm run dev
```

四次正式 migration 依次建立 Resource、User/Session、Resource.ownerId、KnowledgeDocument/KnowledgeChunk 和 `vector(1024)`。生产 Build Command 为 `npm run vercel-build`，执行 Prisma Client 生成、`migrate deploy`、`migrate status` 和 Next.js build。

`npm test` 使用项目本地的 `tsx` 运行无数据库单元测试。真实模式仍有每用户每分钟 5 次 HTTP 请求限制，另按 Provider 工作量预留每分钟 10 单位：问答、建议、流式回答和检索各 1，RAG 问答 2，文档入库按分块数（最多 8）一次性预留。Mock 不消耗这份 Provider 预算。该限制基于单实例内存，不是跨实例计费系统。

## Production

URL：https://aifoundry-stage3-workbench-referenc.vercel.app/

验证日期：2026-10-02。独立 Neon PostgreSQL 17 + pgvector 0.8.0，四次正式 migration、Production Build 与 Stage 2/3 公网功能检查通过。Stage 3 课程仍未发布。
