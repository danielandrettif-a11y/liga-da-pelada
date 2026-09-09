import { expect, test } from "@playwright/test";

const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
const roundId = process.env.E2E_ROUND_ID;
const matchId = process.env.E2E_MATCH_ID;
const allowMutations = process.env.E2E_ALLOW_MUTATIONS === "true";

test.describe("fluxos críticos de rodada e pontuação", () => {
  test.skip(!email || !password, "Configure uma conta administradora exclusiva do ambiente E2E.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email!);
    await page.locator('input[name="password"]').fill(password!);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("admin abre o construtor de rodada", async ({ page }) => {
    await page.goto("/admin/rodada");
    await expect(page.locator("body")).not.toContainText("Algo saiu do jogo");
    await expect(page.getByText(/rodada|pré-lista/i).first()).toBeVisible();
  });

  test("rodada preparada abre sem erro", async ({ page }) => {
    test.skip(!roundId, "Configure E2E_ROUND_ID com uma rodada descartável.");
    await page.goto(`/rodadas/${roundId}`);
    await expect(page.locator("body")).not.toContainText("Algo saiu do jogo");
    await expect(page.getByText(/rodada/i).first()).toBeVisible();
  });

  test("partida de teste expõe cronômetro e pontuação", async ({ page }) => {
    test.skip(!matchId, "Configure E2E_MATCH_ID com uma partida descartável.");
    await page.goto(`/partidas/${matchId}`);
    await expect(page.locator("body")).not.toContainText("Algo saiu do jogo");
    await expect(page.getByText(/placar|partida|cronômetro/i).first()).toBeVisible();
  });

  test("registra e desfaz um gol sem deixar resíduos", async ({ page }) => {
    test.skip(!allowMutations || !matchId, "Habilite mutações somente em uma partida descartável em andamento.");
    await page.goto(`/partidas/${matchId}`);

    const addGoal = page.getByRole("button", { name: /^Registrar gol para/ }).first();
    await expect(addGoal).toBeVisible();
    const removeGoals = page.getByRole("button", { name: "Remover gol" });
    const initialGoalCount = await removeGoals.count();
    let goalCreated = false;

    try {
      await addGoal.click();
      const goalDialog = page.locator(".mobile-dialog-backdrop").filter({ hasText: "Quem fez o gol?" });
      await expect(goalDialog).toBeVisible();
      await goalDialog.locator("button:has(span)").first().click();
      await page.getByRole("button", { name: /^Sem assistência/ }).click();
      await expect(removeGoals).toHaveCount(initialGoalCount + 1);
      goalCreated = true;
    } finally {
      if (goalCreated) {
        page.once("dialog", (dialog) => dialog.accept());
        await removeGoals.first().click();
        await expect(removeGoals).toHaveCount(initialGoalCount);
      }
    }
  });
});
