import HomePage from "@/components/layout/home-page";
import { getHomeSections } from "@/lib/market-items";

export default async function Home() {
  const sections = await getHomeSections();

  return <HomePage sections={sections} />;
}
