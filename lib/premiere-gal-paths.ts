/** Host for the Gal Toolkit MAX storefront (see `proxy.ts` rewrites). */
export const PREMIEREGAL_SUBDOMAIN_HOST = "premieregal.motionflow.pro";

export function isPremiereGalSubdomainHost(hostname: string): boolean {
  const host = hostname.toLowerCase().split(":")[0]?.trim() ?? "";
  return host === PREMIEREGAL_SUBDOMAIN_HOST;
}

export type PremiereGalPaths = {
  /** Landing: `/` on subdomain, `/premiere-gal` on main site. */
  home: string;
  /** Showcase: `/showcase` on subdomain, `/premiere-gal/showcase` on main site. */
  showcase: string;
  download: (platform: "windows" | "mac") => string;
};

/** Pathnames that work on both `premieregal.*` (via rewrite) and `motionflow.pro/premiere-gal`. */
export function premiereGalPaths(onSubdomain: boolean): PremiereGalPaths {
  if (onSubdomain) {
    return {
      home: "/",
      showcase: "/showcase",
      download: (platform) => `/download/${platform}`,
    };
  }
  return {
    home: "/premiere-gal",
    showcase: "/premiere-gal/showcase",
    download: (platform) => `/premiere-gal/download/${platform}`,
  };
}
