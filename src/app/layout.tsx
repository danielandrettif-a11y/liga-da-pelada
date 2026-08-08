import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Liga da Pelada",
  description: "O Cartola da sua pelada. Acompanhe gols, assistências, rankings e muito mais.",
  keywords: ["pelada", "futebol", "ranking", "estatísticas", "liga"],
  authors: [{ name: "Liga da Pelada" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0B0E14",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Header />
        <main className="flex-1 px-4 pt-4 pb-24 max-w-lg mx-auto w-full">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
