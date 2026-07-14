"use client";

import { createContext } from "react";
import type { ShowcaseNode } from "../showcase-types";

export interface ShowcaseContextValue {
  tree: ShowcaseNode[];
  openFolders: Record<string, boolean>;
  selectedCategory: ShowcaseNode | undefined;
  isPending: boolean;
  sectionRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  handleFolderClick: (node: ShowcaseNode, level: number) => void;
}

export const ShowcaseContext = createContext<ShowcaseContextValue | null>(null);
