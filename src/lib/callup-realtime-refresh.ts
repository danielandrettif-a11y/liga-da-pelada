/** Agrupa eventos e limita recargas da rota por navegador. */
export function createCallupRealtimeRefresh(options: {
  refresh: () => void;
  isVisible: () => boolean;
  now: () => number;
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel: (timer: ReturnType<typeof setTimeout>) => void;
  delayMs: number;
  minimumIntervalMs: number;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastRefresh = -Infinity;
  let disposed = false;
  function request() {
    if (disposed || !options.isVisible() || timer !== undefined) return;
    const delay = Math.max(options.delayMs, lastRefresh + options.minimumIntervalMs - options.now());
    timer = options.schedule(() => {
      timer = undefined;
      if (disposed || !options.isVisible()) return;
      lastRefresh = options.now();
      options.refresh();
    }, delay);
  }
  function dispose() {
    disposed = true;
    if (timer !== undefined) options.cancel(timer);
    timer = undefined;
  }
  return { request, dispose };
}
