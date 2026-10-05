import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const pageRevalidationHeaders = [
      {
        key: "Cache-Control",
        value: "no-cache, must-revalidate",
      },
      { key: "Pragma", value: "no-cache" },
      { key: "Expires", value: "0" },
    ];
    const apiNoStoreHeaders = [
      {
        key: "Cache-Control",
        value: "no-store, no-cache, must-revalidate, max-age=0",
      },
      { key: "Pragma", value: "no-cache" },
      { key: "Expires", value: "0" },
    ];

    return [
      { source: "/", headers: pageRevalidationHeaders },
      { source: "/ranking", headers: pageRevalidationHeaders },
      { source: "/ships", headers: pageRevalidationHeaders },
      { source: "/user/:path*", headers: pageRevalidationHeaders },
      { source: "/api/gas", headers: apiNoStoreHeaders },
    ];
  },
};

export default nextConfig;
