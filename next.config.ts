import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  outputFileTracingIncludes: { "/*": ["./node_modules/@ffmpeg-installer/**/*"] },
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
