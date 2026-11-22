import { statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const archiveArgument = process.argv[2];
const targetIndex = process.argv.indexOf("--target-major");
const targetMajor = targetIndex >= 0 ? Number(process.argv[targetIndex + 1]) : NaN;
const allowPartial = process.argv.includes("--allow-partial");
const asJson = process.argv.includes("--json");

if (!archiveArgument || !Number.isInteger(targetMajor) || targetMajor < 10) {
  fail("Uso: node scripts/check-db-archive.mjs <arquivo.dump> --target-major <versão> [--allow-partial] [--json]");
}

const archive = resolve(archiveArgument);
try {
  if (!statSync(archive).isFile()) fail("O caminho informado não é um arquivo.");
} catch {
  fail("Arquivo de backup não encontrado.");
}

const pgRestore = process.env.PG_RESTORE_BIN || "pg_restore";
const listing = spawnSync(pgRestore, ["--list", archive], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
if (listing.error || listing.status !== 0) {
  fail(`Não foi possível ler o catálogo com pg_restore: ${listing.error?.message || listing.stderr?.trim() || "erro desconhecido"}`);
}

const versionMatch = listing.stdout.match(/Dumped from database version:\s*(\d+)(?:\.(\d+))?/);
const sourceMajor = Number(versionMatch?.[1]);
if (!Number.isInteger(sourceMajor)) fail("O catálogo não informa a versão de origem do PostgreSQL.");

const schemas = [...listing.stdout.matchAll(/^\d+;[^\r\n]*?\bSCHEMA - ([\w]+)\b/gm)]
  .map((match) => match[1]);
const extensions = [...listing.stdout.matchAll(/^\d+;[^\r\n]*?\bEXTENSION - ([\w-]+)\b/gm)]
  .map((match) => match[1]);
const missingPlatformSchemas = ["auth", "storage"].filter((name) => !schemas.includes(name));
const problems = [];
if (sourceMajor > targetMajor) {
  problems.push(`Backup originado no PostgreSQL ${sourceMajor}; restauração direta em ${targetMajor} é downgrade.`);
}
if (missingPlatformSchemas.length && !allowPartial) {
  problems.push(`Faltam schemas de plataforma: ${missingPlatformSchemas.join(", ")}. Use um backup completo ou --allow-partial apenas para inspeção.`);
}

const result = {
  archive,
  sourceVersion: versionMatch[0].split(":")[1].trim(),
  targetMajor,
  schemas,
  extensions,
  hasTableData: /^\d+;[^\r\n]*\bTABLE DATA\b/m.test(listing.stdout),
  compatibleForDirectRestore: problems.length === 0,
  problems,
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Origem: PostgreSQL ${result.sourceVersion}; destino: PostgreSQL ${targetMajor}`);
  console.log(`Schemas: ${schemas.join(", ") || "nenhum"}`);
  console.log(`Extensões: ${extensions.join(", ") || "nenhuma"}`);
  console.log(`Inclui dados de tabelas: ${result.hasTableData ? "sim" : "não"}`);
  for (const problem of problems) console.error(`ERRO: ${problem}`);
  if (!problems.length) console.log("Catálogo compatível para ensaio de restore; isso não valida extensões, roles nem aplicação.");
}
if (problems.length) process.exitCode = 1;
