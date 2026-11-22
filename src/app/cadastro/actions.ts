"use server";

import { createClient } from "@/lib/supabase/server";
import { AUTH_CALLBACK_URL } from "@/lib/siteUrl";
import { identityPublicApi } from "@/modules/identity/infrastructure/identity-api-session";
import { IdentityApiError } from "@/modules/identity/infrastructure/http-identity-gateway";
import { createIdentityPkceFlow, storeIdentityPkceVerifier } from "@/modules/identity/infrastructure/identity-pkce";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const passwordConfirmation = String(formData.get("password_confirmation") || "");
  const name = String(formData.get("name") || "").trim();
  const requestedNext = String(formData.get("next") || "");
  const returnTo = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "";

  if (!email || !email.includes("@")) return { success: false, error: "Informe um e-mail válido." };
  if (password.length < 8) return { success: false, error: "A senha precisa ter pelo menos 8 caracteres." };
  if (password !== passwordConfirmation) return { success: false, error: "As senhas não conferem." };
  if (!name) return { success: false, error: "Informe o seu nome." };
  if (name.length > 120) return { success: false, error: "Nome muito longo." };

  let api;
  try {
    api = identityPublicApi();
  } catch (error) {
    return {
      success: false,
      error: error instanceof IdentityApiError ? error.message : "Não foi possível criar a conta agora.",
    };
  }
  if (api) {
    try {
      const flow = createIdentityPkceFlow();
      const receipt = await api.signup({
        email, password, name,
        flowId: flow.flowId,
        codeChallenge: flow.codeChallenge,
        returnPath: returnTo || null,
      });
      if (receipt.session) {
        const client = await createClient();
        const { error } = await client.auth.setSession({
          access_token: receipt.session.accessToken,
          refresh_token: receipt.session.refreshToken,
        });
        if (error) return { success: false, error: "Não foi possível iniciar a sessão da nova conta." };
      } else {
        await storeIdentityPkceVerifier(flow);
      }
      return { success: true, requiresConfirmation: receipt.requiresConfirmation, email };
    } catch (error) {
      return {
        success: false,
        error: error instanceof IdentityApiError ? error.message : "Não foi possível criar a conta agora.",
      };
    }
  }

  const client = await createClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${AUTH_CALLBACK_URL}${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}`,
      data: {
        name,
      },
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return { success: false, error: "Este e-mail já possui uma conta." };
    }
    return { success: false, error: error.message };
  }

  if (!data.user) return { success: false, error: "Não foi possível criar a conta." };
  if (data.user.identities?.length === 0) {
    return {
      success: false,
      error: "Não foi possível concluir o cadastro. Se você já criou uma conta, confirme o e-mail ou tente entrar.",
    };
  }

  return {
    success: true,
    requiresConfirmation: !data.session,
    email,
  };
}
