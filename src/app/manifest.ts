import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Pelada BQ",
    short_name: "Pelada BQ",
    description: "Suas peladas, convocações, ranking e Cartola em um lugar.",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    launch_handler: {
      client_mode: "navigate-existing",
    },
    orientation: "portrait",
    background_color: "#05100B",
    theme_color: "#05100B",
    lang: "pt-BR",
    categories: ["sports", "games", "social"],
    icons: [
      {
        src: "/icons/pelada-bq-v2-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/pelada-bq-v2-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/pelada-bq-v2-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    related_applications: [
      {
        platform: "webapp",
        url: `${SITE_URL}/manifest.webmanifest`,
      },
    ],
    prefer_related_applications: false,
  };
}
