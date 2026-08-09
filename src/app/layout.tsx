import type { Metadata, Viewport } from "next";
import { Inter, Oswald } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { SessionBottomNav } from "@/components/SessionBottomNav";
import { SessionInstallAppPrompt } from "@/components/SessionInstallAppPrompt";
import { Header } from "@/components/Header";

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

export const metadata: Metadata = {
  title: "Pelada de Baixa Qualidade",
  description: "O Cartola da sua pelada. Acompanhe gols, assistências, rankings e muito mais.",
  keywords: ["pelada", "futebol", "ranking", "estatísticas", "liga"],
  authors: [{ name: "Pelada de Baixa Qualidade" }],
  applicationName: "Pelada de Baixa Qualidade",
  icons: {
    icon: [
      { url: "/icons/pelada-bq-v2-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/pelada-bq-v2-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/pelada-bq-v2-apple-180.png", sizes: "180x180", type: "image/png" },
    ],
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
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0B0E14",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${oswald.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Header />
        <main className="flex-1 px-4 pt-4 pb-24 max-w-lg mx-auto w-full">
          {children}
        </main>
        <Suspense fallback={null}>
          <SessionBottomNav />
        </Suspense>
        <Suspense fallback={null}>
          <SessionInstallAppPrompt />
        </Suspense>
      </body>
    </html>
  );
}
