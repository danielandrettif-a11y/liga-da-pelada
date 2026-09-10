"use server";

import { createClient } from "@/lib/supabase/server";
import { AUTH_CALLBACK_URL } from "@/lib/siteUrl";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function safeReturnPath(value: FormDataEntryValue | string | null | undefined) {
  const path = String(value || "");
  return path.startsWith("/") && !path.startsWith("//") ? path : null;
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const returnTo = safeReturnPath(formData.get("next"));
  
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        error: "Confirme seu cadastro no e-mail antes de entrar. Confira também a caixa de spam.",
      };
    }
    return { error: "Email ou senha incorretos." };
  }

  const { error: profileRepairError } = await supabase.rpc("ensure_my_player_account");
  if (profileRepairError) {
    console.error("Erro ao concluir perfil após login:", profileRepairError);
  }

  const { data: profile } = await supabase
    .from("account_profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  revalidatePath("/", "layout");
  redirect(returnTo || (profile?.role === "admin" ? "/" : "/meu-perfil"));
}

export async function signInWithGoogle(returnPath?: string) {
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

  redirect(data.url);
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { success: false, error: "Digite um e-mail válido." };
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
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { success: false, error: "Não foi possível alterar a senha. Solicite um novo link e tente novamente." };

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login?password=updated");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
