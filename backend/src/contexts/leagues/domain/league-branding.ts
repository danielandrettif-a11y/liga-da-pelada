export type BrandingAssetKind = "logo" | "cover";

export type BrandingAsset = {
  kind: BrandingAssetKind;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Uint8Array;
};

export type LeagueBrandingInput = {
  accentColor: string;
  logo: BrandingAsset | null;
  cover: BrandingAsset | null;
  removeLogo: boolean;
  removeCover: boolean;
};

export class InvalidLeagueBrandingError extends Error {
  constructor(message = "Identidade visual inválida.") {
    super(message);
    this.name = "InvalidLeagueBrandingError";
  }
}

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function hasExpectedSignature(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "image/png") {
    return bytes.length >= 8
      && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/webp") {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

function parseAsset(kind: BrandingAssetKind, asset: {
  contentType: string;
  bytes: Uint8Array;
} | null | undefined): BrandingAsset | null {
  if (!asset) return null;
  const limit = kind === "logo" ? 4 * 1024 * 1024 : 8 * 1024 * 1024;
  if (!acceptedTypes.has(asset.contentType) || asset.bytes.byteLength === 0 || asset.bytes.byteLength > limit
    || !hasExpectedSignature(asset.contentType, asset.bytes)) {
    throw new InvalidLeagueBrandingError(
      `${kind === "logo" ? "O escudo" : "A capa"} deve ser JPG, PNG ou WebP e respeitar o limite de tamanho.`,
    );
  }
  return { kind, contentType: asset.contentType as BrandingAsset["contentType"], bytes: asset.bytes };
}

export function parseLeagueBranding(input: {
  accent_color: string;
  logo?: { contentType: string; bytes: Uint8Array } | null;
  cover?: { contentType: string; bytes: Uint8Array } | null;
  remove_logo?: boolean;
  remove_cover?: boolean;
}): LeagueBrandingInput {
  const accentColor = input.accent_color.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(accentColor)) {
    throw new InvalidLeagueBrandingError("Escolha uma cor válida no formato hexadecimal.");
  }
  const removeLogo = input.remove_logo === true;
  const removeCover = input.remove_cover === true;
  return {
    accentColor,
    logo: removeLogo ? null : parseAsset("logo", input.logo),
    cover: removeCover ? null : parseAsset("cover", input.cover),
    removeLogo,
    removeCover,
  };
}
