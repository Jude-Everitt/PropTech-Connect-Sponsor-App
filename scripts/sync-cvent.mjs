import { randomBytes } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
process.env.CRON_SECRET = randomBytes(32).toString("hex");

try {
  const { GET } = await import("../app/api/sync/cvent/route.ts");
  const response = await GET(new Request("http://localhost/api/sync/cvent", {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }));
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error ?? `Cvent sync failed with HTTP ${response.status}`);
  }

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Cvent sync failed");
  process.exitCode = 1;
}