import fs from "node:fs/promises";
import path from "node:path";
import PageContainer from "./components/PageContainer";
import ShowcaseNavigation from "./components/ShowcaseNavigation";
import ShowcaseHeader from "./showcase-header";
import type { ShowcaseNode } from "./showcase-types";
import "./showcase.css";

async function loadTree(): Promise<ShowcaseNode[]> {
  const file = path.join(process.cwd(), "public", "lib", "tree.json");
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as ShowcaseNode[];
}

/** Port of `resources/js/premieregalassets/App.jsx` + `resources/views/premieregal/showcase.blade.php`. */
export default async function PremiereGalShowcasePage() {
  const tree = await loadTree();

  return (
    <PageContainer>
      <ShowcaseHeader />
      <ShowcaseNavigation tree={tree} />
    </PageContainer>
  );
}
