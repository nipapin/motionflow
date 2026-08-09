/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: [
    'motionflow.com',
    '*.motionflow.com',
    'spunkramv2.motionflow.pro',
    'premieregal.motionflow.pro',
  ],
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
        // Catch-all for obsolete profile slugs. Keep real routes in the negative lookahead
        // (including `packages`) or they 308 → /profile and look "unclickable".
        source:
          '/profile/:slug((?!downloads|purchases|subscriptions|favorites|generations|dashboard|upload|items|earnings|payouts|packages)[^/]+)',
        destination: '/profile',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
