import { appendFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const required = [
  "OLD_SUPABASE_URL",
  "OLD_SERVICE_ROLE_KEY",
  "NEW_SUPABASE_URL",
  "NEW_SERVICE_ROLE_KEY",
];

for (const key of required) {
  if (!process.env[key]) throw new Error(`O secret ${key} nao foi configurado.`);
}

const oldUrl = process.env.OLD_SUPABASE_URL.replace(/\/$/, "");
const newUrl = process.env.NEW_SUPABASE_URL.replace(/\/$/, "");

if (oldUrl === newUrl) throw new Error("A URL de origem e a de destino sao iguais.");

const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
};
const oldClient = createClient(oldUrl, process.env.OLD_SERVICE_ROLE_KEY, clientOptions);
const newClient = createClient(newUrl, process.env.NEW_SERVICE_ROLE_KEY, clientOptions);

async function listAllFiles(bucketId, prefix = "") {
  const files = [];
  let offset = 0;

  while (true) {
    const { data, error } = await oldClient.storage.from(bucketId).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Nao foi possivel listar ${bucketId}/${prefix}: ${error.message}`);
    if (!data?.length) break;

    for (const item of data) {
      const path = `${prefix}${item.name}`;
      if (item.id == null || item.metadata == null) {
        files.push(...await listAllFiles(bucketId, `${path}/`));
      } else {
        files.push({ path, metadata: item.metadata });
      }
    }

    if (data.length < 1000) break;
    offset += data.length;
  }

  return files;
}

function bucketOptions(bucket) {
  return {
    public: Boolean(bucket.public),
    ...(bucket.file_size_limit == null ? {} : { fileSizeLimit: bucket.file_size_limit }),
    ...(bucket.allowed_mime_types == null ? {} : { allowedMimeTypes: bucket.allowed_mime_types }),
  };
}

async function ensureBucket(bucket) {
  const options = bucketOptions(bucket);
  const { data: existing, error: readError } = await newClient.storage.getBucket(bucket.id);

  if (readError && !readError.message.toLowerCase().includes("not found")) {
    throw new Error(`Nao foi possivel consultar o bucket ${bucket.id}: ${readError.message}`);
  }

  if (!existing) {
    const { error } = await newClient.storage.createBucket(bucket.id, options);
    if (error) throw new Error(`Nao foi possivel criar o bucket ${bucket.id}: ${error.message}`);
    return;
  }

  const { error } = await newClient.storage.updateBucket(bucket.id, options);
  if (error) throw new Error(`Nao foi possivel atualizar o bucket ${bucket.id}: ${error.message}`);
}

async function copyFile(bucketId, file) {
  const { data, error: downloadError } = await oldClient.storage.from(bucketId).download(file.path);
  if (downloadError) throw new Error(`download: ${downloadError.message}`);

  const metadata = file.metadata || {};
  const { error: uploadError } = await newClient.storage.from(bucketId).upload(
    file.path,
    await data.arrayBuffer(),
    {
      upsert: true,
      ...(metadata.mimetype ? { contentType: metadata.mimetype } : {}),
      ...(metadata.cacheControl || metadata.cache_control
        ? { cacheControl: metadata.cacheControl || metadata.cache_control }
        : {}),
    },
  );
  if (uploadError) throw new Error(`upload: ${uploadError.message}`);
}

const { data: buckets, error: bucketsError } = await oldClient.storage.listBuckets();
if (bucketsError) throw new Error(`Nao foi possivel listar os buckets: ${bucketsError.message}`);

const results = [];
const failures = [];

for (const bucket of [...(buckets || [])].sort((a, b) => a.id.localeCompare(b.id))) {
  await ensureBucket(bucket);
  const files = await listAllFiles(bucket.id);
  let copied = 0;

  for (const file of files) {
    try {
      await copyFile(bucket.id, file);
      copied += 1;
    } catch (error) {
      failures.push({ bucket: bucket.id, path: file.path, message: error instanceof Error ? error.message : String(error) });
    }
  }

  results.push({ bucket: bucket.id, files: files.length, copied });
  console.log(`Bucket ${bucket.id}: ${copied}/${files.length} arquivos copiados.`);
}

const totalFiles = results.reduce((total, result) => total + result.files, 0);
const totalCopied = results.reduce((total, result) => total + result.copied, 0);
const summary = [
  "### Resultado da migracao do Storage",
  "",
  "| Item | Total |",
  "| --- | ---: |",
  `| Buckets | ${results.length} |`,
  `| Arquivos encontrados | ${totalFiles} |`,
  `| Arquivos copiados | ${totalCopied} |`,
  `| Falhas | ${failures.length} |`,
];

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary.join("\n")}\n`);
}

if (failures.length) {
  const preview = failures.slice(0, 10).map((failure) => `${failure.bucket}/${failure.path}: ${failure.message}`).join("\n");
  throw new Error(`${failures.length} arquivo(s) nao foram copiados.\n${preview}`);
}
