import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.higgsfield.ai" },
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "**.higgs.ai" },
      { protocol: "https", hostname: "**.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
