"use server";

import { createClient } from "@/lib/supabase/server";
import { AUTH_CALLBACK_URL } from "@/lib/siteUrl";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ENTRY_FLOW_PENDING_COOKIE, resolveLoginDestination } from "@/lib/entry-flow";
import { identityApiFor, identityPublicApi } from "@/modules/identity/infrastructure/identity-api-session";
import { IdentityApiError } from "@/modules/identity/infrastructure/http-identity-gateway";
import { createIdentityPkceFlow, storeIdentityPkceVerifier } from "@/modules/identity/infrastructure/identity-pkce";

function safeReturnPath(value: FormDataEntryValue | string | null | undefined) {
  const path = String(value || "");
  return path.startsWith("/") && !path.startsWith("//") ? path : null;
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const returnTo = safeReturnPath(formData.get("next"));
  const supabase = await createClient();

  let api;
  try {
    api = identityPublicApi();
  } catch (error) {
    return { error: error instanceof IdentityApiError ? error.message : "Não foi possível entrar agora." };
  }
  if (api) {
    try {
      const session = await api.login(email, password);
      const { error } = await supabase.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      if (error) return { error: "Não foi possível iniciar a sessão. Tente novamente." };
    } catch (error) {
      return { error: error instanceof IdentityApiError ? error.message : "Não foi possível entrar agora." };
    }
  } else {

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.code === "email_not_confirmed") {
        return {
          error: "Confirme seu cadastro no e-mail antes de entrar. Confira também a caixa de spam.",
        };
      }
      return { error: "Email ou senha incorretos." };
    }

    const { error: profileRepairError } = await supabase.rpc("ensure_my_player_account");
    if (profileRepairError) console.error("Erro ao concluir perfil após login:", profileRepairError);
  }

  revalidatePath("/", "layout");
  const entryFlowPending = Boolean((await cookies()).get(ENTRY_FLOW_PENDING_COOKIE)?.value);
  redirect(resolveLoginDestination(returnTo, entryFlowPending));
}

export async function signInWithGoogle(returnPath?: string) {
  let api;
  try {
    api = identityPublicApi();
  } catch (error) {
    return { error: error instanceof IdentityApiError ? error.message : "Não foi possível entrar com o Google agora." };
  }
  if (api) {
    try {
      const flow = createIdentityPkceFlow();
      const url = await api.googleAuthorization({
        flowId: flow.flowId,
        codeChallenge: flow.codeChallenge,
        returnPath: safeReturnPath(returnPath),
      });
      await storeIdentityPkceVerifier(flow);
      return redirect(url);
    } catch (error) {
      if (error instanceof IdentityApiError) return { error: error.message };
      throw error;
    }
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${AUTH_CALLBACK_URL}${safeReturnPath(returnPath) ? `?next=${encodeURIComponent(returnPath!)}` : ""}`,
    },
  });

  if (error || !data.url) {
    return {
      error: "Não foi possível entrar com o Google agora. Tente novamente em instantes.",
    };
  }

  return redirect(data.url);
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { success: false, error: "Digite um e-mail válido." };
  }

  let api;
  try {
    api = identityPublicApi();
  } catch (error) {
    return {
      success: false,
      error: error instanceof IdentityApiError
        ? error.message
        : "Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.",
    };
  }
  if (api) {
    try {
      const flow = createIdentityPkceFlow();
      await api.requestPasswordReset(email, {
        flowId: flow.flowId,
        codeChallenge: flow.codeChallenge,
        returnPath: "/redefinir-senha",
      });
      await storeIdentityPkceVerifier(flow);
      return {
        success: true,
        message: "Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.",
      };
    } catch (error) {
      console.error("Erro ao solicitar recuperação de senha pela API:", error);
      return {
        success: false,
        error: error instanceof IdentityApiError
          ? error.message
          : "Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.",
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${AUTH_CALLBACK_URL}?next=${encodeURIComponent("/redefinir-senha")}`,
  });
  if (error) {
    console.error("Erro ao solicitar recuperação de senha:", error.message);
    return { success: false, error: "Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos." };
  }
  return {
    success: true,
    message: "Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.",
  };
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirmation = String(formData.get("password_confirmation") || "");
  if (password.length < 8) return { success: false, error: "A senha precisa ter pelo menos 8 caracteres." };
  if (password !== confirmation) return { success: false, error: "As senhas não conferem." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Este link expirou. Solicite uma nova recuperação de senha." };
  try {
    const api = await identityApiFor(supabase);
    if (api) {
      await api.updatePassword(password);
      try {
        await api.logout();
      } catch (error) {
        console.error("Senha alterada, mas a revogação remota da sessão falhou:", error);
      }
      await supabase.auth.signOut({ scope: "local" });
    } else {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { success: false, error: "Não foi possível alterar a senha. Solicite um novo link e tente novamente." };
      await supabase.auth.signOut();
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof IdentityApiError
        ? error.message
        : "Não foi possível alterar a senha. Solicite um novo link e tente novamente.",
    };
  }
  revalidatePath("/", "layout");
  redirect("/login?password=updated");
}

export async function logout() {
  const supabase = await createClient();
  let usedApi = false;
  try {
    const api = await identityApiFor(supabase);
    if (api) {
      usedApi = true;
      await api.logout();
    }
  } catch (error) {
    console.error("Erro ao encerrar a sessão no backend:", error);
  }
  await supabase.auth.signOut(usedApi ? { scope: "local" } : undefined);
  revalidatePath("/", "layout");
  redirect("/inicio");
}
