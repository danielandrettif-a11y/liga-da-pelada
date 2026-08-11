"use server";

import { createClient } from "@/lib/supabase/server";
import { AUTH_CALLBACK_URL } from "@/lib/siteUrl";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const passwordConfirmation = String(formData.get("password_confirmation") || "");
  const name = String(formData.get("name") || "").trim();
  const nickname = String(formData.get("nickname") || "").trim();
  const playerProfile = String(formData.get("player_profile") || "midfield");
  const requestedNext = String(formData.get("next") || "");
  const returnTo = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "";

  if (!email || !email.includes("@")) return { success: false, error: "Informe um e-mail válido." };
  if (password.length < 8) return { success: false, error: "A senha precisa ter pelo menos 8 caracteres." };
  if (password !== passwordConfirmation) return { success: false, error: "As senhas não conferem." };
  if (!name) return { success: false, error: "Informe o seu nome." };
  if (name.length > 120 || nickname.length > 60) return { success: false, error: "Nome ou apelido muito longo." };
  if (!["offensive", "midfield", "defensive"].includes(playerProfile)) {
    return { success: false, error: "Escolha um estilo de jogo válido." };
  }

  const client = await createClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${AUTH_CALLBACK_URL}${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}`,
      data: {
        name,
        nickname,
        player_profile: playerProfile,
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
