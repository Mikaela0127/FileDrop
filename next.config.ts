import type { NextConfig } from "next";

import { createSecurityHeaders } from "./src/lib/http/security-headers";

const nextConfig: NextConfig = {
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
