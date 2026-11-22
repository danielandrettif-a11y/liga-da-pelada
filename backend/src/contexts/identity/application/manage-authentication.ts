import type { Actor } from "../../../shared/actor.js";
import {
  callbackUrl,
  normalizeEmail,
  parseName,
  parsePassword,
  parsePkceExchange,
  parsePkceStart,
  type PkceStart,
} from "../domain/authentication.js";

export type IdentitySession = { accessToken: string; refreshToken: string };
export type SignupReceipt = {
  userId: string;
  session: IdentitySession | null;
  identitiesCount: number | null;
};

export interface IdentityAuthProvider {
  signup(input: {
    email: string;
    password: string;
    name: string;
    redirectTo: string;
    codeChallenge: string;
  }): Promise<SignupReceipt>;
  login(email: string, password: string): Promise<{ userId: string; session: IdentitySession }>;
  requestPasswordReset(email: string, redirectTo: string, codeChallenge: string): Promise<void>;
  googleAuthorizationUrl(redirectTo: string, codeChallenge: string): Promise<string>;
  exchangePkceCode(code: string, codeVerifier: string): Promise<{ userId: string; session: IdentitySession }>;
  updatePassword(accessToken: string, password: string): Promise<void>;
  logout(accessToken: string): Promise<void>;
}

export interface IdentityProfileRepository {
  ensureProfile(actor: Actor): Promise<void>;
}

async function repairProfile(userId: string, profiles: IdentityProfileRepository): Promise<void> {
  try {
    await profiles.ensureProfile({ userId });
  } catch {
    // Preserva a sessão válida. O perfil pode ser reparado no próximo login,
    // como no fluxo legado; indisponibilidade do banco não invalida o Auth.
  }
}

function redirectFor(appPublicUrl: string, input: PkceStart): { redirectTo: string; codeChallenge: string } {
  const pkce = parsePkceStart(input);
  return { redirectTo: callbackUrl(appPublicUrl, pkce), codeChallenge: pkce.codeChallenge };
}

export async function signup(input: {
  email: string;
  password: string;
  name: string;
  pkce: PkceStart;
}, appPublicUrl: string, provider: IdentityAuthProvider): Promise<SignupReceipt> {
  const redirect = redirectFor(appPublicUrl, input.pkce);
  return provider.signup({
    email: normalizeEmail(input.email),
    password: parsePassword(input.password),
    name: parseName(input.name),
    ...redirect,
  });
}

export async function login(
  email: string,
  password: string,
  provider: IdentityAuthProvider,
  profiles: IdentityProfileRepository,
) {
  const receipt = await provider.login(normalizeEmail(email), password);
  await repairProfile(receipt.userId, profiles);
  return receipt.session;
}

export async function requestPasswordReset(
  email: string,
  pkce: PkceStart,
  appPublicUrl: string,
  provider: IdentityAuthProvider,
): Promise<void> {
  const redirect = redirectFor(appPublicUrl, { ...pkce, returnPath: "/redefinir-senha" });
  await provider.requestPasswordReset(normalizeEmail(email), redirect.redirectTo, redirect.codeChallenge);
}

export async function googleAuthorization(
  pkce: PkceStart,
  appPublicUrl: string,
  provider: IdentityAuthProvider,
): Promise<string> {
  const redirect = redirectFor(appPublicUrl, pkce);
  return provider.googleAuthorizationUrl(redirect.redirectTo, redirect.codeChallenge);
}

export async function exchangePkceCode(
  code: string,
  codeVerifier: string,
  provider: IdentityAuthProvider,
  profiles: IdentityProfileRepository,
): Promise<IdentitySession> {
  const parsed = parsePkceExchange(code, codeVerifier);
  const receipt = await provider.exchangePkceCode(parsed.code, parsed.codeVerifier);
  await repairProfile(receipt.userId, profiles);
  return receipt.session;
}

export function updatePassword(accessToken: string, password: string, provider: IdentityAuthProvider): Promise<void> {
  return provider.updatePassword(accessToken, parsePassword(password));
}

export function logout(accessToken: string, provider: IdentityAuthProvider): Promise<void> {
  return provider.logout(accessToken);
}
