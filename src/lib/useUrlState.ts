"use client";

import { useCallback, useEffect, useState } from "react";

type UrlStateOptions<T extends string> = {
  key: string;
  initialValue: T;
  defaultValue?: T;
  allowedValues: readonly T[];
  history?: "push" | "replace";
};

/**
 * Mantém abas e filtros no histórico sem disparar uma nova renderização do
 * servidor. O histórico nativo é integrado ao App Router do Next e permite
 * que Voltar/Avançar restaurem exatamente o estado visual anterior.
 */
export function useUrlState<T extends string>({
  key,
  initialValue,
  defaultValue = initialValue,
  allowedValues,
  history = "push",
}: UrlStateOptions<T>) {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    const syncFromUrl = () => {
      const candidate = new URLSearchParams(window.location.search).get(key) as T | null;
      setValue(candidate && allowedValues.includes(candidate) ? candidate : defaultValue);
    };

    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [allowedValues, defaultValue, key]);

  const updateValue = useCallback((nextValue: T) => {
    setValue(nextValue);
    const url = new URL(window.location.href);
    if (nextValue === defaultValue) url.searchParams.delete(key);
    else url.searchParams.set(key, nextValue);

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    if (history === "replace") window.history.replaceState(null, "", nextUrl);
    else window.history.pushState(null, "", nextUrl);
  }, [defaultValue, history, key]);

  return [value, updateValue] as const;
}
