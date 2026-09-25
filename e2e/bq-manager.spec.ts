import { expect, test } from "@playwright/test";

test("demonstração permite abrir um pacote, escolher uma carta e consultar o álbum", async ({ page }) => {
  await page.goto("/bq-manager/demo");
  await expect(page.getByRole("heading", { name: "Campos Atlético" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Áreas do BQ Manager" });
  await nav.getByRole("button", { name: "Pacotes", exact: true }).click();
  await page.getByRole("button", { name: "Abrir pacote", exact: true }).first().click();
  const choices = page.getByRole("button", { name: /^Escolher / });
  await expect(choices).toHaveCount(3);
  const selectedName = (await choices.first().innerText()).replace("Escolher ", "");
  await choices.first().click();
  await expect(page.getByRole("status")).toContainText("Carta adicionada");
  await nav.getByRole("button", { name: "Álbum", exact: true }).click();
  await expect(page.locator("article").filter({ hasText: selectedName })).toContainText("1 cópia(s) no clube");
  await nav.getByRole("button", { name: "Cartas", exact: true }).click();
  await expect(page.getByRole("heading", { name: selectedName, exact: true })).toBeVisible();
  await page.reload();
  await nav.getByRole("button", { name: "Cartas", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(6);
});

test("herança mostra a prévia, exige ciência do consumo e conserva cinco cartas", async ({ page }) => {
  await page.goto("/bq-manager/demo");
  const nav = page.getByRole("navigation", { name: "Áreas do BQ Manager" });
  await nav.getByRole("button", { name: "Evoluir", exact: true }).click();
  await page.getByRole("group", { name: /Cartas doadoras/ }).getByRole("checkbox").first().check();
  await expect(page.getByText("74.0 → 77.0", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar evolução" })).toBeDisabled();
  await page.getByLabel("Entendi que as doadoras serão consumidas e não poderão ser recuperadas.").check();
  await page.getByRole("button", { name: "Confirmar evolução" }).click();
  await expect(page.getByRole("status")).toContainText("Evolução concluída");
  await nav.getByRole("button", { name: "Cartas", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(5);
  await expect(page.locator("article").first()).toContainText("77.0");
});

test("fusão de quatro cópias aplica +2 e não deixa rolagem horizontal no celular", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/bq-manager/demo");
  await page.getByRole("button", { name: "Evoluir", exact: true }).click();
  await page.getByLabel("Tipo de evolução").selectOption("four");
  const donors = page.getByRole("group", { name: /Cartas doadoras/ }).getByRole("checkbox");
  for (let index = 1; index <= 4; index++) await donors.nth(index).check();
  await expect(page.getByText("74.0 → 76.0", { exact: true })).toBeVisible();
  await page.getByLabel("Entendi que as doadoras serão consumidas e não poderão ser recuperadas.").check();
  await page.getByRole("button", { name: "Confirmar evolução" }).click();
  await page.getByRole("navigation", { name: "Áreas do BQ Manager" }).getByRole("button", { name: "Cartas", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
