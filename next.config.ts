import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // FFmpeg WASM core aynı origin'den servis edilir; wasm MIME tipini sabitle.
  async headers() {
    return [
      {
        source: "/ffmpeg/:path*",
        headers: [
          {
            key: "Cache-Control",
            // Dosyalar sürüm sorgusuyla istenir; geliştirmede önbellek tutma.
            value:
              process.env.NODE_ENV === "production"
                ? "public, max-age=31536000, immutable"
                : "no-store",
          },
        ],
      },
      {
        source: "/ffmpeg/:path*.wasm",
        headers: [
          {
            key: "Content-Type",
            value: "application/wasm",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
