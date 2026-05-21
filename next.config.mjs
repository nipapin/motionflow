/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['motionflow.com', '*.motionflow.com', 'spunkramv2.motionflow.pro'],
  async redirects() {
    return [
      {
        source: '/subscription',
        destination: '/pricing',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
