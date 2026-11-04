import type { NextConfig } from "next";

const supabaseImageSource = (() => {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
    return {
      protocol: url.protocol === "http:" ? "http" as const : "https" as const,
      hostname: url.hostname,
      port: url.port,
    };
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    // O backend usa NodeNext e, corretamente, referencia o artefato `.js`.
    // Ao compartilhar o domínio TypeScript com o Next, apontamos esses imports
    // internos para os fontes, sem alterar a saída executável do backend.
    resolveAlias: {
      "./bq-scoring.js": "./backend/src/contexts/fantasy/domain/bq-scoring.ts",
      "./column-c-scoring.js": "./backend/src/contexts/fantasy/domain/column-c-scoring.ts",
      "./config.js": "./backend/src/contexts/fantasy/domain/config.ts",
      "./engine.js": "./backend/src/contexts/fantasy/domain/engine.ts",
      "./goalkeeper-timeline.js": "./backend/src/contexts/statistics/domain/goalkeeper-timeline.ts",
      "./lineup-positions.js": "./backend/src/contexts/fantasy/domain/lineup-positions.ts",
      "./market-v11.js": "./backend/src/contexts/fantasy/domain/market-v11.ts",
      "./position-breakdown.js": "./backend/src/contexts/fantasy/domain/position-breakdown.ts",
      "./ranked-scoring.js": "./backend/src/contexts/fantasy/domain/ranked-scoring.ts",
      "./reserve.js": "./backend/src/contexts/fantasy/domain/reserve.ts",
      "../../statistics/domain/goalkeeper-timeline.js": "./backend/src/contexts/statistics/domain/goalkeeper-timeline.ts",
    },
  },
  images: {
    // Cartas, escudos e avatares são servidos em vários tamanhos no celular.
    // Deixar o Next gerar WebP/AVIF evita baixar a arte original em cada miniatura.
    formats: ["image/avif", "image/webp"],
    deviceSizes: [320, 420, 640, 750, 828, 1080, 1200],
    imageSizes: [48, 64, 96, 128, 180, 240, 320, 430],
    remotePatterns: supabaseImageSource
      ? [{ ...supabaseImageSource, pathname: "/storage/v1/object/public/**" }]
      : [],
    qualities: [75, 90],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      {
        source: "/images/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=2592000" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
