import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

async function filesUnder(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const location = join(path, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(location));
    else if (entry.isFile()) result.push(location);
  }
  return result;
}

const sourceFiles = (await filesUnder(join(root, "src")))
  .filter((path) => /\.[cm]?[jt]sx?$/.test(path));
const migrationFiles = (await filesUnder(join(root, "supabase", "migrations")))
  .filter((path) => path.endsWith(".sql"));

const sourcePatterns = {
  supabaseSdk: /(?:@supabase\/|@\/lib\/supabase|\.from\(|\.rpc\()/,
  auth: /(?:\.auth\.|getAdminClient|getCurrentAccount|createServerClient)/,
  storage: /(?:\.storage\.|\/storage\/v1\/)/,
  realtime: /(?:postgres_changes|\.channel\(|removeChannel\()/,
  serverAction: /^\s*["']use server["'];?/m,
};
const migrationPatterns = {
  auth: /\bauth\.(?:uid|jwt|role|users)\b/i,
  storage: /\bstorage\.(?:objects|buckets|foldername)\b/i,
  realtime: /\brealtime\./i,
  rowLevelSecurity: /\b(?:ROW LEVEL SECURITY|CREATE POLICY|ALTER POLICY)\b/i,
};

async function inventory(paths, patterns) {
  const result = Object.fromEntries(Object.keys(patterns).map((key) => [key, []]));
  for (const path of paths) {
    const content = await readFile(path, "utf8");
    const name = relative(root, path).replaceAll("\\", "/");
    for (const [key, pattern] of Object.entries(patterns)) {
      if (pattern.test(content)) result[key].push(name);
    }
  }
  return result;
}

const report = {
  generatedAt: new Date().toISOString(),
  sourceFileCount: sourceFiles.length,
  migrationFileCount: migrationFiles.length,
  source: await inventory(sourceFiles, sourcePatterns),
  migrations: await inventory(migrationFiles, migrationPatterns),
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(`Arquivos de código: ${report.sourceFileCount}; migrations SQL: ${report.migrationFileCount}`);
  for (const [section, entries] of Object.entries({ source: report.source, migrations: report.migrations })) {
    console.log(`\n${section}:`);
    for (const [category, paths] of Object.entries(entries)) {
      console.log(`  ${category}: ${paths.length} arquivos`);
    }
  }
  console.log("\nUse --json para obter a lista de arquivos por categoria.");
}
