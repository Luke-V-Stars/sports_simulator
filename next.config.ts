import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // How long data from ESPN is reused before we ask ESPN again.
  // "live" is used for scoreboards so in-progress scores stay fresh.
  cacheLife: {
    live: { stale: 30, revalidate: 30, expire: 300 },
  },
  images: {
    // Team logos and player headshots come from ESPN's image server.
    remotePatterns: [{ protocol: "https", hostname: "a.espncdn.com" }],
  },
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
