import path from "path";
import dotenv from "dotenv";
import type { NextConfig } from "next";

// Keep env/ next to the app (same pattern as web/) so Cloudflare Pages builds
// only need this package's NEXT_PUBLIC_* values.
const envFileName = process.env.APP_ENV ? `.env.${process.env.APP_ENV}` : ".env";
dotenv.config({ path: path.resolve(__dirname, "env", envFileName), quiet: true });

const nextConfig: NextConfig = {
  agentRules: false,
  output: "export",
  // Keep Turbopack rooted on this package even if a parent lockfile exists.
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_TEST_API_BASE_URL:
      process.env.NEXT_PUBLIC_TEST_API_BASE_URL ?? "http://localhost:4004",
  },
};

export default nextConfig;
