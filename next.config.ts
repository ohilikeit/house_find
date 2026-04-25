import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cafeptthumb-phinf.pstatic.net",
      },
    ],
  },
};

export default nextConfig;
