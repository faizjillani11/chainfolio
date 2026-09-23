import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// .env.local lives at repo root (shared with analysis service)
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
loadEnvConfig(repoRoot);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["0.0.0.0"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.ipfs.dweb.link" },
      { protocol: "https", hostname: "ipfs.io" },
      { protocol: "https", hostname: "cloudflare-ipfs.com" },
      { protocol: "https", hostname: "metadata.ens.domains" },
      { protocol: "https", hostname: "**.mypinata.cloud" },
      { protocol: "https", hostname: "**.nftstorage.link" },
    ],
  },
};

export default nextConfig;
