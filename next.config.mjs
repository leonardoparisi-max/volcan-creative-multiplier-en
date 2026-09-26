/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // API routes shell out to ffmpeg/whisper and stream long-running renders.
  experimental: {
    // Allow large request bodies for config/components payloads.
  },
};

export default nextConfig;
