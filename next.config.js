/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: [
      "@prisma/client",
      "puppeteer-core",
      "@sparticuz/chromium-min",
    ],
  },
}
module.exports = nextConfig
