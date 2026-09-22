import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "戦力評価アプリ",
    short_name: "戦力評価",
    description: "艦船の所有状況と技術ポイントを管理する戦力評価アプリ",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f4f6",
    theme_color: "#0b3b82",
    icons: [
      {
        src: "/icons/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
