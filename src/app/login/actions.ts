"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthSiteUrl } from "@/lib/siteUrl";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  
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

  const { data: profile } = await supabase
    .from("account_profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  revalidatePath("/", "layout");
  redirect(profile?.role === "admin" ? "/" : "/meu-perfil");
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const requestHeaders = await headers();
  const siteUrl = getAuthSiteUrl(requestHeaders);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error || !data.url) {
    return {
      error: "Não foi possível entrar com o Google agora. Tente novamente em instantes.",
    };
  }

  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
