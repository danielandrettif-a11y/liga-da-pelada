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

test("abas do ranking respeitam URL e o botão voltar", async ({ page }) => {
  await page.goto("/ranking");
  const fieldTab = page.getByRole("tab", { name: /Em Campo/ });
  await expect(fieldTab).toBeVisible();

  await page.getByRole("tab", { name: /Cartola/ }).click();
  await expect(page).toHaveURL(/mode=fantasy/);
  await expect(page.getByRole("heading", { name: "Ranking do Cartola" })).toBeVisible();

  await page.goBack();
  await expect(page).not.toHaveURL(/mode=fantasy/);
  await expect(fieldTab).toHaveClass(/bg-accent/);
});

test("filtro do elenco sobrevive a recarregamento", async ({ page }) => {
  await page.goto("/jogadores");
  const wagsTab = page.getByRole("tab", { name: "WAGs" });
  await wagsTab.click();
  await expect(page).toHaveURL(/filter=wags/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "WAGs" })).toHaveAttribute("aria-selected", "true");
});

test("rota inexistente oferece retorno seguro", async ({ page }) => {
  const response = await page.goto("/esta-tela-nao-existe");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Essa tela saiu de campo." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar ao início" })).toHaveAttribute("href", "/");
});
