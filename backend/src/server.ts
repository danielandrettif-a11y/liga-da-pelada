import pg from "pg";
import { supabaseUserVerifier } from "./infrastructure/auth-user-verifier.js";
import { pgGoalRepository } from "./infrastructure/pg-goal-repository.js";
import { createApp } from "./presentation/app.js";

const goalsEnabled = process.env.ENABLE_GOAL_API === "true";
const port = Number(process.env.PORT || "3001");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT inválida.");
}

const databaseUrl = process.env.DATABASE_URL;
const authUrl = process.env.SUPABASE_INTERNAL_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
if (goalsEnabled && (!databaseUrl || !authUrl || !publishableKey)) {
  throw new Error("ENABLE_GOAL_API requer DATABASE_URL, SUPABASE_INTERNAL_URL e SUPABASE_PUBLISHABLE_KEY.");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
const app = createApp({
  goalsEnabled,
  verifier: supabaseUserVerifier(authUrl || "http://127.0.0.1:54321", publishableKey || ""),
  repository: pgGoalRepository(pool),
});

try {
  await app.listen({ host: "0.0.0.0", port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await pool.end();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => pool.end());
  });
}
