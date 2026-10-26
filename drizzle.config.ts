import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";
import { cleanDatabaseUrl } from "./src/db/database-url";
import { databaseTlsOptions } from "./src/db/tls-options";

dotenv.config({ path: ".env.local" });
const rawDatabaseUrl = cleanDatabaseUrl(process.env.DATABASE_URL);
const databaseUrl = rawDatabaseUrl ? new URL(rawDatabaseUrl) : undefined;

export default {
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  // Drizzle Kit ignores sibling ssl options when credentials contain `url`.
  // Structured credentials ensure both supported Postgres drivers receive TLS.
  // Generation can still run offline; connection commands require credentials.
  dbCredentials: databaseUrl ? {
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : 5432,
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: decodeURIComponent(databaseUrl.pathname.slice(1)),
    ssl: databaseTlsOptions(databaseUrl, process.env.DATABASE_SSL_CA),
  } : undefined,
} satisfies Config;
