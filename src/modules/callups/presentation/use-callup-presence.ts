"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createCallupRealtimeRefresh } from "@/lib/callup-realtime-refresh";
import type { CallupWithEntries } from "@/lib/actions/callups";
import { apiClient } from "@/modules/shared/infrastructure/api-client";

const request = apiClient({ fallback: "Não foi possível atualizar a lista." });
type ListTab = "confirmed" | "waitlist";
type PresenceResult = { success: boolean; error?: string; status?: ListTab };

export function useCallupPresence({
  callup,
  refreshRoute,
  cartolaEnabled,
  allowDirectRead,
  setActiveTab,
}: {
  callup: CallupWithEntries;
  refreshRoute: () => void;
  cartolaEnabled: boolean;
  allowDirectRead: boolean;
  setActiveTab: (tab: ListTab) => void;
}) {
  const [, startRealtimeRefresh] = useTransition();
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [showCartolaPopup, setShowCartolaPopup] = useState(false);
  const [showWaitlistPopup, setShowWaitlistPopup] = useState(false);
  const refreshEntriesRef = useRef<(() => void) | null>(null);
  const [snapshot, setSnapshot] = useState<{
    source: CallupWithEntries;
    entries: CallupWithEntries["entries"];
  } | null>(null);

  useEffect(() => {
    let needsFullRefresh = false;
    let inFlight: AbortController | null = null;
    let directReadEnabled = allowDirectRead;

    const refresh = () => startRealtimeRefresh(refreshRoute);
    const refreshEntries = () => {
      inFlight?.abort();
      if (needsFullRefresh || !directReadEnabled) {
        needsFullRefresh = false;
        refresh();
        return;
      }
      const controller = new AbortController();
      inFlight = controller;
      const query = new URLSearchParams({ leagueId: callup.league_id });
      void request(`/api/backend/callups/active?${query}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
      }).then(async (response) => {
        const callups = await response.json() as Pick<CallupWithEntries, "id" | "updated_at" | "entries">[];
        if (controller.signal.aborted) return;
        const current = callups.find((item) => item.id === callup.id);
        if (!current || current.updated_at !== callup.updated_at) {
          refresh();
          return;
        }
        setSnapshot({ source: callup, entries: current.entries });
      }).catch(() => {
        if (controller.signal.aborted) return;
        directReadEnabled = false;
        refresh();
      });
    };
    refreshEntriesRef.current = refreshEntries;
    const scheduler = createCallupRealtimeRefresh({
      refresh: refreshEntries,
      isVisible: () => document.visibilityState === "visible" && window.location.pathname === "/convocacao",
      now: Date.now,
      schedule: (callback, delay) => setTimeout(callback, delay),
      cancel: clearTimeout,
      delayMs: 500 + Math.random() * 1000,
      minimumIntervalMs: 5000,
    });
    const refreshPage = () => {
      needsFullRefresh = true;
      inFlight?.abort();
      scheduler.request();
    };
    const eventQuery = new URLSearchParams({ leagueId: callup.league_id, callupId: callup.id });
    const events = new EventSource(`/api/backend/callups/events?${eventQuery}`);
    let fallbackInterval: number | null = null;
    const startFallback = () => {
      if (fallbackInterval !== null) return;
      fallbackInterval = window.setInterval(() => {
        if (document.visibilityState === "visible") scheduler.request();
      }, 15_000);
    };
    const stopFallback = () => {
      if (fallbackInterval === null) return;
      window.clearInterval(fallbackInterval);
      fallbackInterval = null;
    };
    events.addEventListener("open", stopFallback);
    events.addEventListener("error", startFallback);
    events.addEventListener("snapshot", (event) => {
      try {
        const current = JSON.parse((event as MessageEvent<string>).data) as Pick<CallupWithEntries, "id" | "updated_at" | "entries">;
        if (current.id !== callup.id) return;
        setSnapshot({ source: callup, entries: current.entries });
        if (current.updated_at !== callup.updated_at) refresh();
      } catch {
        scheduler.request();
      }
    });
    events.addEventListener("refresh", refreshPage);

    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") refreshPage();
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      refreshEntriesRef.current = null;
      inFlight?.abort();
      scheduler.dispose();
      events.close();
      stopFallback();
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [allowDirectRead, callup, refreshRoute]);

  async function run(key: string, action: () => Promise<PresenceResult>) {
    setLoading(key);
    setError("");
    try {
      const result = await action();
      if (!result.success) {
        setError(result.error || "Não foi possível atualizar a lista.");
        return;
      }
      if (cartolaEnabled && key === "join" && result.status === "confirmed") setShowCartolaPopup(true);
      if (key === "join" && result.status === "waitlist" && callup.round_type === "official") {
        setShowWaitlistPopup(true);
        setActiveTab("waitlist");
      }
      if (allowDirectRead && callup.status === "open" && (key === "join" || key === "leave") && refreshEntriesRef.current) {
        refreshEntriesRef.current();
      } else {
        refreshRoute();
      }
    } catch {
      setError("Não foi possível atualizar a lista.");
    } finally {
      setLoading("");
    }
  }

  return {
    entries: snapshot?.source === callup ? snapshot.entries : callup.entries,
    loading, setLoading, error, setError, showCartolaPopup, setShowCartolaPopup,
    showWaitlistPopup, setShowWaitlistPopup, run,
  };
}
