import { expect, test } from "@playwright/test";

test("login e cadastro continuam acessíveis", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Pelada BQ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await page.getByRole("link", { name: "Criar minha conta" }).click();
  await expect(page).toHaveURL(/\/cadastro/);
  await expect(page.getByRole("heading").first()).toBeVisible();
});

test("páginas públicas não retornam erro fatal", async ({ page }) => {
  for (const path of ["/inicio", "/estadio", "/bq-manager/demo"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(500);
    await expect(page.locator("body")).not.toContainText("Algo saiu do jogo");
  }
});

test("áreas da pelada exigem login e preservam o destino", async ({ page }) => {
  for (const path of ["/rodadas", "/ranking?filter=legacy", "/jogadores?filter=wags", "/cartola"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
    const next = new URL(page.url()).searchParams.get("next");
    expect(next, path).toBe(path);
    await expect(page.getByRole("heading", { name: "Pelada BQ" })).toBeVisible();
  }
});

test("destino protegido desconhecido também retorna ao login com segurança", async ({ page }) => {
  await page.goto("/esta-tela-nao-existe");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/esta-tela-nao-existe");
  await expect(page.getByRole("link", { name: "Conhecer o projeto" })).toHaveAttribute("href", "/inicio");
});
