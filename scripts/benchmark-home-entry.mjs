import { chromium, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

const target = new URL(process.env.PERF_BASE_URL || "https://homologacao-pelada.179.197.75.220.sslip.io");
if (target.origin !== "https://homologacao-pelada.179.197.75.220.sslip.io"
  || target.username || target.password || target.pathname !== "/" || target.search || target.hash) {
  throw new Error("O benchmark autenticado só pode rodar no domínio de homologação.");
}
const storageState = process.env.PERF_STORAGE_STATE;
const leagueId = process.env.PERF_LEAGUE_ID;
if (!storageState || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(leagueId || "")) {
  throw new Error("Informe PERF_STORAGE_STATE (sessão de teste do Playwright) e PERF_LEAGUE_ID.");
}
const iterations = Number(process.env.PERF_WEB_ITERATIONS || 30);
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 30) {
  throw new Error("Use de 1 a 30 amostras por cenário.");
}
const legacy = process.env.PERF_HOME_LEGACY === "1";
const browser = await chromium.launch();
const report = {
  origin: target.origin,
  profile: "390x844, RTT 80 ms, 4 Mbps download, 1 Mbps upload, CPU 4x",
  legacy,
  scenarios: {},
};

async function openContext() {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
    viewport: { width: 390, height: 844 },
    storageState,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 80, downloadThroughput: 500_000, uploadThroughput: 125_000,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  return { context, page };
}

async function sample(page, journey) {
  const traceId = randomUUID();
  let started;
  let actionResponse;
  let firstHomeResponseMs;
  const record = (response) => {
    if (started === undefined || new URL(response.url()).origin !== target.origin) return;
    const request = response.request();
    const pathname = new URL(response.url()).pathname;
    if (pathname === "/lobby" && request.method() === "POST") {
      actionResponse = Math.round(performance.now() - started);
    }
    if (pathname === "/" && firstHomeResponseMs === undefined) {
      firstHomeResponseMs = Math.round(performance.now() - started);
    }
  };
  page.on("response", record);
  try {
    if (journey === "entry") {
      await page.goto(new URL("/lobby", target).href, { waitUntil: "domcontentloaded" });
      const form = page.locator("form").filter({ has: page.locator(`input[name="league_id"][value="${leagueId}"]`) })
        .filter({ has: page.getByRole("button", { name: "Entrar no clube", exact: true }) }).first();
      const button = form.getByRole("button", { name: "Entrar no clube", exact: true });
      await button.click({ trial: true, timeout: 12_000 });
      if (!legacy) await form.evaluate((element, value) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "home_trace";
        input.value = value;
        element.append(input);
      }, traceId);
      started = performance.now();
      await button.click();
    } else {
      started = performance.now();
      await page.goto(new URL(legacy ? "/" : `/?home_trace=${traceId}`, target).href, { waitUntil: "commit" });
    }
    await page.waitForURL((url) => url.origin === target.origin && url.pathname === "/", { timeout: 15_000 });
    const agenda = legacy
      ? page.locator("section").filter({ has: page.getByRole("heading", { name: /agenda e gestão|próxima rodada/i }) }).last()
      : page.locator("[data-home-agenda]");
    const action = agenda.locator('a[href^="/convocacao"], a[href^="/rodadas"]').first();
    await action.waitFor({ state: "visible", timeout: 15_000 });
    const firstCardMs = Math.round(performance.now() - started);
    if (!legacy) await agenda.locator('[data-home-ready="true"]').waitFor({ state: "attached", timeout: 15_000 });
    const hydratedMs = legacy ? undefined : Math.round(performance.now() - started);
    return { traceId: legacy ? undefined : traceId, firstCardMs, hydratedMs, actionResponse, firstHomeResponseMs };
  } catch (error) {
    return { traceId: legacy ? undefined : traceId, error: error.name };
  } finally {
    page.off("response", record);
  }
}

function percentiles(samples, field) {
  const values = samples.map((result) => result[field]).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return null;
  return Object.fromEntries([50, 75, 95].map((p) => [`p${p}`, values[Math.ceil(values.length * p / 100) - 1]]));
}

try {
  for (const journey of ["entry", "reopen"]) {
    for (const cache of ["cold", "warm"]) {
      const samples = [];
      const warm = cache === "warm" ? await openContext() : null;
      try {
        if (warm) await sample(warm.page, journey);
        for (let index = 0; index < iterations; index += 1) {
          const current = warm || await openContext();
          try { samples.push(await sample(current.page, journey)); }
          finally { if (!warm) await current.context.close(); }
        }
      } finally {
        if (warm) await warm.context.close();
      }
      report.scenarios[`${journey}_${cache}`] = {
        firstCardMs: percentiles(samples, "firstCardMs"),
        hydratedMs: percentiles(samples, "hydratedMs"),
        entryResponseMs: percentiles(samples, "actionResponse"),
        homeResponseMs: percentiles(samples, "firstHomeResponseMs"),
        failures: samples.filter((result) => result.error).length,
        samples,
      };
    }
  }
  console.log(JSON.stringify(report, null, 2));
  if (Object.values(report.scenarios).some((scenario) => scenario.failures)) process.exitCode = 1;
} finally {
  await browser.close();
}
