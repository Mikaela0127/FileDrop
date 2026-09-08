import type { NextConfig } from "next";

import { createSecurityHeaders } from "./src/lib/http/security-headers";

const nextConfig: NextConfig = {
  // Vercel keeps its native build output. Container builds opt in to Next.js's
  // minimal, self-contained Node.js server from the Dockerfile.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...createSecurityHeaders({
            isDevelopment: process.env.NODE_ENV === "development",
          }),
        ],
      },
    ];
  },
};

export default nextConfig;
