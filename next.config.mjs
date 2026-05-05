/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['motionflow.com', '*.motionflow.com', 'spunkram.motionflow.pro'],
}

export default nextConfig
