import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Development only: lets a second signed-out browser session run at 127.0.0.1 beside localhost.
  allowedDevOrigins: ["127.0.0.1"],
  // Verification uploads (one document per request). Vercel caps request bodies at 4.5 MB.
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
