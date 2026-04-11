import HomePage from "@/components/layout/home-page";
import { getMarketItems } from "@/lib/market-items";

export default async function Home() {
  const marketItems = await getMarketItems();

  return <HomePage marketItems={marketItems} />;
}
