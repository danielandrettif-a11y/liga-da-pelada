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
      bodySizeLimit: "6mb",
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
