/** @type {import('next').NextConfig} */
const nextConfig = {
  // Live PM2 serves `.next`; deploy builds into `.next-build` then swaps (see scripts/swap-next-build.mjs).
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
        // Catch-all for obsolete Laravel profile slugs → /profile.
        //
        // IMPORTANT: every real first segment under /profile/<slug> MUST appear in the
        // negative lookahead below. Missing a slug (e.g. forgot `extensions`) makes the
        // page look broken: nav links 308 redirect straight back to /profile.
        // See .cursor/rules/profile-route-allowlist.mdc
        //
        // Allowlist: downloads|purchases|subscriptions|favorites|generations|
        //            dashboard|upload|items|earnings|payouts|packages|extensions
        source:
          '/profile/:slug((?!downloads|purchases|subscriptions|favorites|generations|dashboard|upload|items|earnings|payouts|packages|extensions)[^/]+)',
        destination: '/profile',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
