"use client";

import { useReportWebVitals } from "next/web-vitals";

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const isCoreMetric = ["CLS", "FCP", "INP", "LCP", "TTFB"].includes(metric.name);
    if (!isCoreMetric) return;

    const payload = JSON.stringify({
      kind: "web_vital",
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      path: window.location.pathname,
      metadata: { navigationType: metric.navigationType },
    });

    navigator.sendBeacon(
      "/api/internal/observability",
      new Blob([payload], { type: "application/json" }),
    );
  });

  return null;
}
