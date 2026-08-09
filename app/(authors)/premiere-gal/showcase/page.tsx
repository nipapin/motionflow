import PageContainer from "./components/PageContainer";
import ShowcaseNavigation from "./components/ShowcaseNavigation";
import ShowcaseHeader from "./showcase-header";
import type { ShowcaseNode } from "./showcase-types";
import { loadShowcaseTree } from "@/lib/laravel-port/showcase-tree";
import "./showcase.css";

/** Port of `resources/js/premieregalassets/App.jsx` + `resources/views/premieregal/showcase.blade.php`. */
export default async function PremiereGalShowcasePage() {
  const { tree } = await loadShowcaseTree();

  return (
    <PageContainer>
      <ShowcaseHeader />
      <ShowcaseNavigation tree={tree as unknown as ShowcaseNode[]} />
    </PageContainer>
  );
}
