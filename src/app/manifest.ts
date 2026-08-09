import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Pelada de Baixa Qualidade",
    short_name: "Pelada BQ",
    description: "O Cartola da sua pelada: rodadas, ranking, gols e resenha.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#05100B",
    theme_color: "#05100B",
    lang: "pt-BR",
    categories: ["sports", "games", "social"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
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
