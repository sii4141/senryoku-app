import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "戦力評価",
  description: "艦船の所有状況と技術ポイントを管理する戦力評価アプリ",
  applicationName: "戦力評価",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "戦力評価",
  },
  icons: {
    icon: [
      { url: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/app-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
