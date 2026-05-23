import { NavbarWithOffset } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Logos } from "@/components/Logos";
import { Projects } from "@/components/Projects";
import { Showcase } from "@/components/Showcase";
import { Pricing } from "@/components/Pricing";
import { FAQ } from "@/components/FAQ";
import { Contact } from "@/components/Contact";
import type { Project, ProjectApp } from "@/lib/data";
import type { Product } from "@/lib/product-types";
import { getMarketItemsByAuthorId } from "@/lib/market-items";
import { productSoftwareLabel, productThumbnailUrl } from "@/lib/product-ui";
import { SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";

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
    coverImage: productThumbnailUrl(product) || "/project-cover.png",
    href: `/item/${product.id}`,
  };
}

export default async function HomePage() {
  const items = await getMarketItemsByAuthorId(SPUNKRAM_AUTHOR_ID);
  const projects = items.map(toProject).filter((item): item is Project => item != null);

  return (
    <div className="min-w-0">
      <NavbarWithOffset
        topClassName="top-3"
        position="sticky"
        className="mt-6"
      />
      <main className="relative z-1">
        <Hero />
        <Logos />
        <Projects projects={projects} />
        <Showcase />
        <Pricing />
        <FAQ />
        <Contact />
      </main>
    </div>
  );
}
