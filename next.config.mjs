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
      {
        source: '/my_purchases',
        destination: '/profile/purchases',
        permanent: true,
      },
      {
        source: '/my_subscription',
        destination: '/profile/subscriptions',
        permanent: true,
      },
      {
        source: '/my_downloads',
        destination: '/profile/downloads',
        permanent: true,
      },
      {
        source: '/notifications',
        destination: '/profile',
        permanent: true,
      },
      {
        source: '/favorites',
        destination: '/profile/favorites',
        permanent: true,
      },
      {
        source: '/following',
        destination: '/profile',
        permanent: true,
      },
      {
        source: '/settings',
        destination: '/profile',
        permanent: true,
      },
      {
        source:
          '/profile/:slug((?!downloads|purchases|subscriptions|favorites|generations|dashboard|upload|items|earnings|payouts)[^/]+)',
        destination: '/profile',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
