/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  images: {
    unoptimized: true,
  },
  assetPrefix: process.env.NODE_ENV === 'production' ? '/' : '',
}

module.exports = nextConfig
