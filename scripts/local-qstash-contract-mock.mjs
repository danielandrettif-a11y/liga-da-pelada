import { createServer } from "node:http";

const port = Number.parseInt(process.env.PORT || "8080", 10);
const expectedToken = process.env.QSTASH_TOKEN?.trim();
let acceptedPublishes = 0;

if (!expectedToken) {
  throw new Error("QSTASH_TOKEN is required by the local contract mock.");
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === "GET" && url.pathname === "/metrics") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ acceptedPublishes }));
    return;
  }

  if (request.method !== "POST" || !url.pathname.startsWith("/v2/publish/")) {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  if (request.headers.authorization !== `Bearer ${expectedToken}`) {
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  let size = 0;
  request.on("data", (chunk) => {
    size += chunk.length;
    if (size > 16_384) request.destroy();
  });
  request.on("end", () => {
    acceptedPublishes += 1;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ messageId: `local-contract-${acceptedPublishes}` }));
  });
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`Local QStash contract mock listening on ${port}.\n`);
});

