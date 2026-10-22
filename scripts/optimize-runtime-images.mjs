import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const explicitImages = [
  "public/images/cartola/campo-de-bairro-metade.png",
  "public/images/season-pass-journey-banner.png",
  "public/images/cards/emergency_sub.png",
  "public/images/cards/safe_prediction.png",
  "public/images/cards/extra_credit.png",
  "public/images/cards/bargain.png",
  "public/team-crests/inter-de-meiao.png",
  "public/team-crests/meia-boca-juniors.png",
  "public/team-crests/patetico-de-madrid.png",
  "public/team-crests/milamb.png",
];

async function listPngs(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listPngs(target);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".png") ? [target] : [];
  }));
  return files.flat();
}

// Os frames pequenos dependem de transparência muito precisa e já têm WebP
// dedicado. Convertemos apenas os fundos/capas pesados.
const cosmeticImages = (await listPngs(path.join(projectRoot, "public/images/cosmetics")))
  .filter((file) => !file.includes(`${path.sep}frames${path.sep}`));
const inputs = [
  ...explicitImages.map((file) => path.join(projectRoot, file)),
  ...cosmeticImages,
];

let originalBytes = 0;
let optimizedBytes = 0;

for (const input of inputs) {
  const output = input.replace(/\.png$/i, ".webp");
  await sharp(input)
    .webp({ quality: 80, alphaQuality: 90, effort: 5, smartSubsample: true })
    .toFile(output);

  const [before, after] = await Promise.all([stat(input), stat(output)]);
  originalBytes += before.size;
  optimizedBytes += after.size;
  console.log(`${path.relative(projectRoot, input)}: ${Math.round(before.size / 1024)} KB -> ${Math.round(after.size / 1024)} KB`);
}

const reduction = originalBytes > 0 ? Math.round((1 - optimizedBytes / originalBytes) * 100) : 0;
console.log(`Total: ${Math.round(originalBytes / 1024)} KB -> ${Math.round(optimizedBytes / 1024)} KB (${reduction}% menor)`);
