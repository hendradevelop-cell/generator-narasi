import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Dipakai image Docker (frontend/Dockerfile): hasil build mandiri tanpa node_modules.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // Izinkan perangkat lain di LAN membuka dev server (Next 16 memblokir
  // permintaan /_next/* dari origin selain localhost tanpa daftar ini).
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
