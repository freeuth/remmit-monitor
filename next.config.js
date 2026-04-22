/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: [
      "@prisma/client",
      "puppeteer-core",
    ],
  },
}
module.exports = nextConfig
