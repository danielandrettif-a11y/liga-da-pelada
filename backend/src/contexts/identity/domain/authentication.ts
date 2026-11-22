export type PkceStart = {
  flowId: string;
  codeChallenge: string;
  returnPath: string | null;
};

export class InvalidAuthenticationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAuthenticationInputError";
  }
}

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    throw new InvalidAuthenticationInputError("Informe um e-mail válido.");
  }
  return email;
}

export function parsePassword(value: string): string {
  if (value.length < 8) throw new InvalidAuthenticationInputError("A senha precisa ter pelo menos 8 caracteres.");
  if (value.length > 1024) throw new InvalidAuthenticationInputError("Senha muito longa.");
  return value;
}

export function parseName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new InvalidAuthenticationInputError("Informe o seu nome.");
  if (name.length > 120) throw new InvalidAuthenticationInputError("Nome muito longo.");
  return name;
}

export function safeReturnPath(value: string | null | undefined): string | null {
  const path = String(value || "");
  return path.startsWith("/") && !path.startsWith("//") ? path : null;
}

export function parsePkceStart(input: PkceStart): PkceStart {
  const flowId = input.flowId.trim();
  const codeChallenge = input.codeChallenge.trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(flowId)) {
    throw new InvalidAuthenticationInputError("Fluxo de autenticação inválido.");
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    throw new InvalidAuthenticationInputError("Desafio de autenticação inválido.");
  }
  return { flowId, codeChallenge, returnPath: safeReturnPath(input.returnPath) };
}

export function parsePkceExchange(code: string, codeVerifier: string) {
  const parsedCode = code.trim();
  const parsedVerifier = codeVerifier.trim();
  if (!parsedCode || parsedCode.length > 2048) {
    throw new InvalidAuthenticationInputError("Código de autenticação inválido.");
  }
  if (!/^[A-Za-z0-9._~-]{43,256}$/.test(parsedVerifier)) {
    throw new InvalidAuthenticationInputError("Verificador de autenticação inválido.");
  }
  return { code: parsedCode, codeVerifier: parsedVerifier };
}

export function callbackUrl(appPublicUrl: string, input: PkceStart): string {
  let url: URL;
  try {
    url = new URL("/auth/callback", appPublicUrl.endsWith("/") ? appPublicUrl : `${appPublicUrl}/`);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid protocol");
  } catch {
    throw new InvalidAuthenticationInputError("URL pública do aplicativo inválida.");
  }
  url.searchParams.set("pkce_flow", input.flowId);
  if (input.returnPath) url.searchParams.set("next", input.returnPath);
  return url.toString();
}
