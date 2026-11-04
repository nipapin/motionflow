import { SpunkramLanguageProvider } from "@/components/spunkram-language";
import { NavbarWithOffset } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Projects } from "@/components/Projects";
import { Showcase } from "@/components/Showcase";
import { Testimonials } from "@/components/Testimonials";
import { Pricing } from "@/components/Pricing";
import { FAQ } from "@/components/FAQ";
import { Contact } from "@/components/Contact";
import { CepExtensionAuthDialog } from "@/components/cep-extension-auth-dialog";
import { SpunkramBuyExtraCredits } from "@/components/spunkram-buy-extra-credits";
import type { Project, ProjectApp } from "@/lib/data";
import type { Product } from "@/lib/product-types";
import { getSpunkramStorefrontItems } from "@/lib/market-items";
import { productCardVideoSrc, productSoftwareLabel, productThumbnailUrl } from "@/lib/product-ui";
import { getSpunkramExtraGenPacks, SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";
import { normalizeCepClient } from "@/lib/cep-client-registry";
import { extraCheckoutBuyer } from "@/lib/spunkram-extra-checkout";
import { isSpunkramSandboxBuyer, spunkramSourceForBuyer } from "@/lib/paddle-actual";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { PaddleProvider } from "@/lib/paddle";
import { getSpunkramPaddleCredentials, isSpunkramCheckoutEnabled, spunkramLocalSandbox } from "@/lib/spunkram-paddle-credentials";

function toProjectApp(product: Product): ProjectApp | null {
  const label = productSoftwareLabel(product);
  if (label === "Premiere Pro" || label === "After Effects") return label;
  return null;
}

function toProject(product: Product): Project | null {
  const app = toProjectApp(product);
  if (!app) return null;

  const priceValue = Number(product.discount_price ?? product.price);
  return {
    id: String(product.id),
    title: product.name || `Project ${product.id}`,
    app,
    price: Number.isFinite(priceValue) ? priceValue : 0,
    previewVideo: productCardVideoSrc(product),
    coverImage: productThumbnailUrl(product) || "/project-cover.png",
    href: `/spunkram/item/${product.id}`,
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; client?: string; extraCheckout?: string }>;
}) {
  const { code, client: clientRaw, extraCheckout } = await searchParams;
  const [items, extraBuyerId] = await Promise.all([getSpunkramStorefrontItems(), extraCheckoutBuyer(extraCheckout)]);
  const projects = items
    .map(toProject)
    .filter((item): item is Project => item != null);

  let extraCheckoutDialog = null;
  if (extraBuyerId !== null) {
    const [source, user, storefrontEnabled] = await Promise.all([
      spunkramSourceForBuyer(extraBuyerId), getSessionUser(), isSpunkramCheckoutEnabled(),
    ]);
    const packs = getSpunkramExtraGenPacks(source.environment);
    extraCheckoutDialog = <SpunkramBuyExtraCredits buyerId={extraBuyerId} packs={packs} />;
    const usingParentCheckout = spunkramLocalSandbox ||
      (source.environment === "sandbox" ? user?.id === extraBuyerId && isSpunkramSandboxBuyer(extraBuyerId) : storefrontEnabled);
    if (!usingParentCheckout) {
      const { clientToken } = await getSpunkramPaddleCredentials(source.environment, false);
      extraCheckoutDialog = <PaddleProvider token={clientToken} environment={source.environment}>
        {extraCheckoutDialog}
      </PaddleProvider>;
    }
  }

  return (
    <SpunkramLanguageProvider>
    <div className="min-w-0">
      <CepExtensionAuthDialog
        initialCode={code ?? ""}
        initialClient={normalizeCepClient(clientRaw)}
      />
      {extraCheckoutDialog}
      <NavbarWithOffset
        topClassName="top-3"
        position="sticky"
        className="mt-6"
      />
      <main className="relative z-1">
        <Hero />
        <Projects projects={projects} />
        <Showcase />
        <Pricing />
        <Testimonials />
        <FAQ />
        <Contact />
      </main>
    </div>
    </SpunkramLanguageProvider>
  );
}
