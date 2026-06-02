/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The API routes read data/ and sources/ at runtime via fs. Next's file
    // tracing doesn't detect these dynamic reads, so they must be explicitly
    // included in the serverless function bundle (otherwise: 500 on Vercel).
    outputFileTracingIncludes: {
      "/api/summary": ["./data/**/*", "./sources/**/*"],
      "/api/overview": ["./data/**/*"],
      "/api/research": ["./data/**/*", "./sources/**/*"],
    },
  },
};

export default nextConfig;
