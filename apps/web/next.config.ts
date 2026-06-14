import type { NextConfig } from "next";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";

try {
  loadEnvFile(resolve(process.cwd(), "../../.env.local"));
} catch {
  // Hosted environments provide secrets directly instead of a root .env.local file.
}

const nextConfig: NextConfig = {
  transpilePackages: ["@r402/core"],
};

export default nextConfig;
