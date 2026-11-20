"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createCallupRealtimeRefresh } from "@/lib/callup-realtime-refresh";
import type { CallupWithEntries } from "@/lib/actions/callups";
import { supabase } from "@/lib/supabase";
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
    const channel = supabase
      .channel(`callup-list-${callup.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "callup_entries", filter: `callup_id=eq.${callup.id}`,
      }, scheduler.request)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "callups", filter: `id=eq.${callup.id}`,
      }, refreshPage)
      .subscribe();

    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") refreshPage();
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      refreshEntriesRef.current = null;
      inFlight?.abort();
      scheduler.dispose();
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      void supabase.removeChannel(channel);
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
