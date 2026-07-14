"use client";

import { Box, Typography } from "@mui/material";
import { Fragment } from "react";
import PreviewCard from "./PreviewCard";
import { useShowcase } from "./use-showcase";
import type { ShowcaseNode } from "../showcase-types";

function collectSections(node: ShowcaseNode, path: string[] = []) {
  const files = node.children.filter((c) => c.type === "video" || c.type === "audio");
  const folders = node.children.filter((c) => c.type === "folder");
  const sections: { breadcrumb: string[]; folder: ShowcaseNode; files: ShowcaseNode[] }[] = [];
  if (files.length > 0) {
    sections.push({ breadcrumb: path, folder: node, files });
  }
  for (const sub of folders) {
    sections.push(...collectSections(sub, [...path, sub.name]));
  }
  return sections;
}

/** Port of `resources/js/premieregalassets/components/showcase/PreviewGrid.jsx`. */
export default function PreviewGrid() {
  const { selectedCategory, sectionRefs } = useShowcase();

  if (!selectedCategory) return null;

  const directFiles = selectedCategory.children.filter((c) => c.type === "video" || c.type === "audio");
  const subFolders = selectedCategory.children.filter((c) => c.type === "folder");
  const sections = subFolders.flatMap((sub) => collectSections(sub, [sub.name]));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1rem" }}>
      <Typography variant="h6">{selectedCategory.name}</Typography>
      {directFiles.length > 0 && (
        <Box sx={{ display: "grid", gridTemplateColumns: { md: "repeat(auto-fill, minmax(200px, 1fr))", sm: "1fr 1fr", xs: "1fr" }, gap: "1rem" }}>
          {directFiles.map((item) => (
            <PreviewCard key={item.href} item={item} />
          ))}
        </Box>
      )}
      {sections.map((section) => (
        <Fragment key={section.folder.href}>
          <Typography
            variant="subtitle1"
            fontWeight={600}
            ref={(el) => {
              sectionRefs.current[section.folder.href] = el;
            }}
            sx={{ pt: "1.5rem" }}
          >
            {section.breadcrumb.join(" / ")}
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { md: "repeat(auto-fill, minmax(200px, 1fr))", sm: "1fr 1fr", xs: "1fr" }, gap: "1rem" }}>
            {section.files.map((item) => (
              <PreviewCard key={item.href} item={item} />
            ))}
          </Box>
        </Fragment>
      ))}
    </Box>
  );
}
