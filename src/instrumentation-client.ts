type ClientEvent = {
  kind: "client_error";
  name: string;
  message: string;
  path: string;
};

function send(event: ClientEvent) {
  try {
    navigator.sendBeacon(
      "/api/internal/observability",
      new Blob([JSON.stringify(event)], { type: "application/json" }),
    );
  } catch {
    // Telemetria nunca deve interromper a aplicação.
  }
}

window.addEventListener("error", (event) => {
  send({
    kind: "client_error",
    name: "window_error",
    message: event.message || "Unknown browser error",
    path: window.location.pathname,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  send({
    kind: "client_error",
    name: "unhandled_rejection",
    message: reason,
    path: window.location.pathname,
  });
});

export function onRouterTransitionStart(url: string, navigationType: "push" | "replace" | "traverse") {
  performance.mark(`route-${navigationType}-${url}`);
}
