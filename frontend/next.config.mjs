/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: [
      "playwright-core",
      "fingerprint-injector",
      "@ai-sdk/google",
      "ai",
    ],
  },
};

export default nextConfig;
