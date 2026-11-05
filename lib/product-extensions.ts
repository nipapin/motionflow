export const PRODUCT_EXTENSIONS = {
  spunkram: {
    slug: "spunkram",
    name: "Spunkram Library",
    windowsInstallerUrl: "https://motionflow.pro/spunkram/downloads/SpunkramInstaller.exe",
    macosInstallerUrl: "https://motionflow.pro/spunkram/downloads/SpunkramInstaller-macOS.zip",
  },
} as const;

export type ProductExtension = (typeof PRODUCT_EXTENSIONS)[keyof typeof PRODUCT_EXTENSIONS];

export function getProductExtension(slug: string | null | undefined): ProductExtension | null {
  return slug === "spunkram" ? PRODUCT_EXTENSIONS.spunkram : null;
}

export function productExtensionInstallerUrl(
  extension: ProductExtension,
  userAgent: string,
  platformHint?: string | null,
): string {
  const platform = platformHint || userAgent;
  return /Macintosh|MacIntel|Mac OS X|macOS/i.test(platform)
    ? extension.macosInstallerUrl
    : extension.windowsInstallerUrl;
}
