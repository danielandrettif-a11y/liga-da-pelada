import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Inter, Oswald } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { SessionBottomNav } from "@/components/SessionBottomNav";
import { SessionInstallAppPrompt } from "@/components/SessionInstallAppPrompt";
import { Header } from "@/components/Header";
import { PwaRegistration } from "@/components/PwaRegistration";
import { WebVitalsReporter } from "@/components/WebVitalsReporter";
import { AppChrome } from "@/components/AppChrome";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  variable: "--font-club-display",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://pelada-de-baixa-qualidade.179.197.75.220.sslip.io"
  ),
  title: "Pelada BQ",
  description: "Organize sua pelada, acompanhe rodadas e rankings e jogue com seus amigos.",
  keywords: ["pelada", "futebol", "ranking", "estatísticas", "liga"],
  authors: [{ name: "Pelada BQ" }],
  applicationName: "Pelada BQ",
  icons: {
    icon: [
      { url: "/icons/pelada-bq-v2-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/pelada-bq-v2-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/pelada-bq-v2-apple-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Pelada BQ",
    title: "Pelada BQ — sua liga de futebol em um só lugar",
    description: "Organize convocações, acompanhe rankings e escale seu time no Cartola da pelada.",
    images: [
      {
        url: "/icons/pelada-bq-v2-512.png",
        width: 512,
        height: 512,
        alt: "Pelada de Baixa Qualidade",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pelada BQ",
    description: "Organize sua pelada, acompanhe rodadas e rankings e jogue com seus amigos.",
    images: ["/icons/pelada-bq-v2-512.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Pelada BQ",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0E14",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${oswald.variable} ${bebasNeue.variable} h-full antialiased`}>
      <body className="min-h-dvh flex flex-col font-sans">
        <WebVitalsReporter />
        <PwaRegistration />
        <AppChrome
          header={<Header />}
          navigation={<Suspense fallback={null}><SessionBottomNav /></Suspense>}
          installPrompt={<Suspense fallback={null}><SessionInstallAppPrompt /></Suspense>}
        >{children}</AppChrome>
      </body>
    </html>
  );
}
