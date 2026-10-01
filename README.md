# AIFoundry Stage 3 Reference — AI 知识工作台

Stage 3.7 Implementation A 的独立生产参考产品。它延续 Stage 2 的账号、Session 和个人资料，加入真实 AI、结构化建议、流式回答、知识文档、pgvector 检索、RAG 与经服务端验证的引用。这里仅包含运行产品所需代码。

技术栈：Next.js 15、React 19、Prisma 6.19.3、PostgreSQL 17、pgvector。

## 环境变量

服务端 Secret：`DATABASE_URL`、`AI_CHAT_API_KEY`、`AI_EMBEDDING_API_KEY`。

服务端配置：`AI_PROVIDER_MODE=real`、`AI_CHAT_BASE_URL`、`AI_CHAT_MODEL=qwen3.7-flash`、`AI_CHAT_DISABLE_THINKING=1`、`AI_EMBEDDING_BASE_URL`、`AI_EMBEDDING_MODEL=text-embedding-v4`、`AI_EMBEDDING_DIMENSION=1024`、`AI_TIMEOUT_MS=20000`。不要为这些变量添加 `NEXT_PUBLIC_` 前缀。真实值仅配置在本地未跟踪 `.env` 或部署平台的 Production 环境中。

## 本地启动与 migration

使用 Node.js 20+ 和独立 PostgreSQL 数据库。先在本地 `.env` 配置变量，再运行：

```bash
npm install
npx prisma migrate deploy
npx prisma migrate status
npm run dev
```

四次正式 migration 依次建立 Resource、User/Session、Resource.ownerId、KnowledgeDocument/KnowledgeChunk 和 `vector(1024)`。生产 Build Command 为 `npm run vercel-build`，执行 Prisma Client 生成、`migrate deploy`、`migrate status` 和 Next.js build。

## Production

URL：待部署验收后填写。

验证日期：待完成 Final Acceptance 后填写。
