import path from "path";
import dotenv from "dotenv";
import type { NextConfig } from "next";

// The frontend keeps its own env/ folder (see env/.env.example) instead of
// relying on Next.js's default root .env* file convention, to stay
// consistent with how every other part of this project is configured.
const envFileName = process.env.APP_ENV ? `.env.${process.env.APP_ENV}` : ".env";
dotenv.config({ path: path.resolve(__dirname, "env", envFileName), quiet: true });

const nextConfig: NextConfig = {
  // Skip Next.js's auto-generated AGENTS.md/CLAUDE.md scaffolding files.
  agentRules: false,
  // Static export: the whole app is pre-rendered to plain HTML/JS/CSS and
  // deployed to Cloudflare Pages with no Node.js server. Every page is a
  // client component that fetches data from the API at runtime, so this
  // works even though order/payment data doesn't exist at build time.
  output: "export",
  images: {
    // next/image's optimization API needs a server, which static export doesn't have.
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000",
  },
};

export default nextConfig;
