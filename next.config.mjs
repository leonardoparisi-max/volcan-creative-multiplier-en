/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // API routes shell out to ffmpeg/whisper and stream long-running renders.
  experimental: {
    // Allow large request bodies for config/components payloads.
    // Native canvas (text hook plates) must stay out of the webpack bundle.
    serverComponentsExternalPackages: ["@napi-rs/canvas"],
  },
};

export default nextConfig;
