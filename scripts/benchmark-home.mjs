import { chromium, devices } from "@playwright/test";
import { performance } from "node:perf_hooks";

const { E2E_BASE_URL, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } = process.env;
const iterations = Number(process.env.PERF_WEB_ITERATIONS || 20);
if (!E2E_BASE_URL || !E2E_ADMIN_EMAIL || !E2E_ADMIN_PASSWORD) {
  throw new Error("Configure E2E_BASE_URL e uma conta de homologação em E2E_ADMIN_EMAIL e E2E_ADMIN_PASSWORD.");
}
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 50) {
  throw new Error("PERF_WEB_ITERATIONS deve ser um inteiro entre 1 e 50.");
}

const homeUrl = new URL("/", E2E_BASE_URL).href;
const mobile = { ...devices["Pixel 7"], baseURL: E2E_BASE_URL };
const browser = await chromium.launch();

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p) => Math.round(sorted[Math.ceil(sorted.length * p) - 1]);
  return { samples: sorted.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: percentile(1) };
}

async function waitForAgenda(page) {
  await page.waitForURL(homeUrl);
  await page.getByRole("heading", { name: /^(agenda e gestão|próxima rodada)$/i }).first()
    .waitFor({ state: "visible" });
  return performance.now();
}

try {
  const loginContext = await browser.newContext(mobile);
  const login = await loginContext.newPage();
  await login.goto("/login");
  await login.locator('input[name="email"]').fill(E2E_ADMIN_EMAIL);
  await login.locator('input[name="password"]').fill(E2E_ADMIN_PASSWORD);
  await login.getByRole("button", { name: "Entrar", exact: true }).click();
  await login.getByRole("link", { name: "Início", exact: true }).first().waitFor({ state: "visible" });
  await login.goto(homeUrl, { waitUntil: "commit" });
  await waitForAgenda(login);
  const storageState = await loginContext.storageState();
  await loginContext.close();

  const first = [];
  const auth = [];
  const membership = [];
  for (let index = 0; index < iterations; index++) {
    const context = await browser.newContext({ ...mobile, storageState });
    try {
      const page = await context.newPage();
      const start = performance.now();
      const response = await page.goto(homeUrl, { waitUntil: "commit" });
      first.push((await waitForAgenda(page)) - start);
      const timing = await response?.headerValue("server-timing");
      for (const [metric, samples] of [["home_auth", auth], ["home_membership", membership]]) {
        const duration = timing?.match(new RegExp(`${metric};dur=([\\d.]+)`))?.[1];
        if (duration !== undefined) samples.push(Number(duration));
      }
    } finally {
      await context.close();
    }
  }

  const context = await browser.newContext({ ...mobile, storageState });
  const page = await context.newPage();
  const returned = [];
  await page.goto(homeUrl, { waitUntil: "commit" });
  await waitForAgenda(page);
  for (let index = 0; index < iterations; index++) {
    await page.getByRole("link", { name: "Mais", exact: true }).first().click();
    await page.waitForURL("**/mais");
    const start = performance.now();
    await page.getByRole("link", { name: "Início", exact: true }).first().click();
    returned.push((await waitForAgenda(page)) - start);
  }
  console.log(JSON.stringify({
    firstAgenda: summarize(first),
    returnAgenda: summarize(returned),
    ...(auth.length && { proxyAuth: summarize(auth) }),
    ...(membership.length && { proxyMembership: summarize(membership) }),
  }, null, 2));
} finally {
  await browser.close();
}
