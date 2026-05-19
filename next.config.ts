import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright", "sharp", "pixelmatch", "pngjs"],
};

export default nextConfig;
