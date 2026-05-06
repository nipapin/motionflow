/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['motionflow.com', '*.motionflow.com', 'spunkramv2.motionflow.pro'],
}

export default nextConfig
