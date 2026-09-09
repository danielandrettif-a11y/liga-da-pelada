import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const projectId = process.env.SUPABASE_PROJECT_ID;
const args = ["gen", "types", "typescript"];
if (projectId) args.push("--project-id", projectId);
else args.push("--local");
args.push("--schema", "public");

const executable = process.platform === "win32" ? "supabase.cmd" : "supabase";
const result = spawnSync(executable, args, { encoding: "utf8", env: process.env });
if (result.error) {
  console.error("Supabase CLI não encontrado. Instale-o ou execute o workflow Database types.");
  process.exit(1);
}
if (result.status !== 0) {
  console.error(result.stderr || "Falha ao gerar tipos do Supabase.");
  process.exit(result.status || 1);
}

writeFileSync("src/lib/database.generated.ts", result.stdout, "utf8");
console.info("Tipos gerados em src/lib/database.generated.ts");
