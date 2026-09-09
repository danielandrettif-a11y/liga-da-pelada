import { expect, test } from "@playwright/test";

test("login e cadastro continuam acessíveis", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Pelada de Baixa Qualidade" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await page.getByRole("link", { name: "Criar minha conta" }).click();
  await expect(page).toHaveURL(/\/cadastro/);
  await expect(page.getByRole("heading").first()).toBeVisible();
});

test("rotas públicas principais não retornam erro fatal", async ({ page }) => {
  for (const path of ["/", "/rodadas", "/ranking", "/jogadores"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(500);
    await expect(page.locator("body")).not.toContainText("Algo saiu do jogo");
  }
});
