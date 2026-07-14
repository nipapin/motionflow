"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { ShowcaseContext } from "./showcase-context";
import type { ShowcaseNode } from "../showcase-types";

/** Port of `resources/js/premieregalassets/components/showcase/ShowcaseContext.jsx`. */
export function ShowcaseProvider({ tree, children }: { tree: ShowcaseNode[]; children: ReactNode }) {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<ShowcaseNode | undefined>(tree[0]);
  const [isPending, startTransition] = useTransition();
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const handleFolderClick = (node: ShowcaseNode, level: number) => {
    const isOpening = !openFolders[node.href];
    setOpenFolders((prev) => ({ ...prev, [node.href]: !prev[node.href] }));
    if (level === 0) {
      startTransition(() => {
        setSelectedCategory(node);
      });
    } else if (isOpening) {
      requestAnimationFrame(() => {
        sectionRefs.current[node.href]?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  return (
    <ShowcaseContext.Provider value={{ tree, openFolders, selectedCategory, isPending, sectionRefs, handleFolderClick }}>
      {children}
    </ShowcaseContext.Provider>
  );
}
