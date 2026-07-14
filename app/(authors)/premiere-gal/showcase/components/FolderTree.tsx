"use client";

import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { Collapse, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
import { Fragment } from "react";
import { useShowcase } from "./use-showcase";
import type { ShowcaseNode } from "../showcase-types";

/** Port of `resources/js/premieregalassets/components/showcase/FolderTree.jsx`. */
export default function FolderTree() {
  const { tree, openFolders, handleFolderClick } = useShowcase();

  const renderList = (nodes: ShowcaseNode[], level = 0) => (
    <List component="div" disablePadding sx={{ width: "100%" }}>
      {nodes.map((node) =>
        node.type === "folder" ? (
          <Fragment key={node.href}>
            <ListItem disableGutters sx={{ pl: level * 2 }}>
              <ListItemButton onClick={() => handleFolderClick(node, level)} sx={{ borderRadius: "0.5rem" }}>
                <ListItemText primary={node.name} />
                <ListItemIcon sx={{ minWidth: 0 }}>
                  {node.counter ? (
                    <Typography sx={{ background: "var(--primary)", p: "0.25rem 0.5rem", borderRadius: "100px", color: "var(--background)", fontWeight: 400 }}>
                      {node.counter}
                    </Typography>
                  ) : null}
                </ListItemIcon>
                <ListItemIcon sx={{ minWidth: 0 }}>
                  {node.children.filter((child) => child.type === "folder").length > 0 ? (
                    openFolders[node.href] ? <ExpandLess /> : <ExpandMore />
                  ) : (
                    <ExpandLess sx={{ transform: "rotate(90deg)" }} />
                  )}
                </ListItemIcon>
              </ListItemButton>
            </ListItem>
            {node.children && (
              <Collapse in={openFolders[node.href]} timeout="auto" unmountOnExit>
                {renderList(node.children, level + 1)}
              </Collapse>
            )}
          </Fragment>
        ) : null,
      )}
    </List>
  );

  return renderList(tree);
}
