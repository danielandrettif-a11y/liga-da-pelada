import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function summarize(samples, field) {
  const values = samples.map((sample) => Number(sample[field] || 0));
  return {
    p50: round(percentile(values, 0.5)),
    p95: round(percentile(values, 0.95)),
    max: round(Math.max(...values)),
  };
}

async function collect(page, targetUrl) {
  const startedAt = performance.now();
  const response = await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 45_000 });
  await page.waitForTimeout(250);
  const wallMs = performance.now() - startedAt;
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    const paints = performance.getEntriesByType("paint");
    const observed = globalThis.__PELADA_PERF_METRICS__ || {};
    const byType = {};
    for (const resource of resources) {
      const type = resource.initiatorType || "other";
      const current = byType[type] || { requests: 0, transferBytes: 0, decodedBytes: 0 };
      current.requests += 1;
      current.transferBytes += Number(resource.transferSize || 0);
      current.decodedBytes += Number(resource.decodedBodySize || 0);
      byType[type] = current;
    }
    return {
      ttfbMs: Number(navigation?.responseStart || 0),
      domContentLoadedMs: Number(navigation?.domContentLoadedEventEnd || 0),
      loadMs: Number(navigation?.loadEventEnd || 0),
      fcpMs: Number(paints.find((entry) => entry.name === "first-contentful-paint")?.startTime || 0),
      lcpMs: Number(observed.lcp || 0),
      cls: Number(observed.cls || 0),
      longTaskMs: Number(observed.longTaskMs || 0),
      longTaskCount: Number(observed.longTaskCount || 0),
      resourceRequests: resources.length,
      transferKb: resources.reduce((sum, item) => sum + Number(item.transferSize || 0), 0) / 1024,
      decodedKb: resources.reduce((sum, item) => sum + Number(item.decodedBodySize || 0), 0) / 1024,
      resourcesByType: byType,
    };
  });
  return {
    status: response?.status() || 0,
    finalUrl: page.url(),
    wallMs: round(wallMs),
    ...metrics,
  };
}

async function newMetricsPage(context) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    globalThis.__PELADA_PERF_METRICS__ = { lcp: 0, cls: 0, longTaskMs: 0, longTaskCount: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) globalThis.__PELADA_PERF_METRICS__.lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) globalThis.__PELADA_PERF_METRICS__.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          globalThis.__PELADA_PERF_METRICS__.longTaskMs += entry.duration;
          globalThis.__PELADA_PERF_METRICS__.longTaskCount += 1;
        }
      }).observe({ type: "longtask", buffered: true });
    } catch {}
  });
  return page;
}

const baseUrl = (process.env.PERF_BASE_URL || "https://pelada-de-baixa-qualidade.179.197.75.220.sslip.io").replace(/\/$/, "");
const routes = (process.env.PERF_ROUTES || "/,/login,/cadastro,/lobby")
  .split(",")
  .map((route) => route.trim())
  .filter(Boolean);
const iterations = Math.min(20, Math.max(3, Number(process.env.PERF_WEB_ITERATIONS || 5)));
const browser = await chromium.launch({ headless: true });
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  profile: "mobile 390x844, sem throttling artificial",
  iterations,
  routes: [],
};

try {
  for (const route of routes) {
    const cold = [];
    for (let index = 0; index < iterations; index += 1) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      });
      const page = await newMetricsPage(context);
      cold.push(await collect(page, `${baseUrl}${route}`));
      await context.close();
    }

    const warmContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const warmPage = await newMetricsPage(warmContext);
    await collect(warmPage, `${baseUrl}${route}`);
    const warm = [];
    for (let index = 0; index < iterations; index += 1) {
      warm.push(await collect(warmPage, `${baseUrl}${route}`));
    }
    await warmContext.close();

    report.routes.push({
      route,
      finalUrl: cold[0]?.finalUrl,
      status: cold[0]?.status,
      cold: {
        wallMs: summarize(cold, "wallMs"),
        ttfbMs: summarize(cold, "ttfbMs"),
        fcpMs: summarize(cold, "fcpMs"),
        lcpMs: summarize(cold, "lcpMs"),
        cls: summarize(cold, "cls"),
        longTaskMs: summarize(cold, "longTaskMs"),
        longTaskCount: summarize(cold, "longTaskCount"),
        loadMs: summarize(cold, "loadMs"),
        transferKb: summarize(cold, "transferKb"),
        requests: summarize(cold, "resourceRequests"),
        sampleResourcesByType: cold[0]?.resourcesByType,
      },
      warm: {
        wallMs: summarize(warm, "wallMs"),
        ttfbMs: summarize(warm, "ttfbMs"),
        fcpMs: summarize(warm, "fcpMs"),
        lcpMs: summarize(warm, "lcpMs"),
        cls: summarize(warm, "cls"),
        longTaskMs: summarize(warm, "longTaskMs"),
        longTaskCount: summarize(warm, "longTaskCount"),
        loadMs: summarize(warm, "loadMs"),
        transferKb: summarize(warm, "transferKb"),
        requests: summarize(warm, "resourceRequests"),
      },
    });
  }
} finally {
  await browser.close();
}

const serialized = JSON.stringify(report, null, 2);
if (process.env.PERF_OUTPUT) {
  fs.mkdirSync(path.dirname(process.env.PERF_OUTPUT), { recursive: true });
  fs.writeFileSync(process.env.PERF_OUTPUT, `${serialized}\n`, "utf8");
}
console.log(serialized);
