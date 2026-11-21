"use client";

import { useEffect, useState } from "react";

export function HomeReadyMarker() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return <span hidden data-home-ready={ready ? "true" : undefined} />;
}
