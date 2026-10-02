import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  engine: "classic",
  // Client generation during a clean install needs a URL shape, not a live database.
  // Migrations and runtime still require an explicit DATABASE_URL for a reachable DB.
  datasource: { url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/unused_for_generate" },
});
