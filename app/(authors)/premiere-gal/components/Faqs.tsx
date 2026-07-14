"use client";

import { Add, Remove } from "@mui/icons-material";
import { Box, Collapse, ListItem, ListItemButton, ListItemText, Stack, Typography, useColorScheme } from "@mui/material";
import { useState } from "react";
import { faqs, type FaqItemData } from "../entities/faqs";

/** Port of `resources/js/premieregal/components/Faqs.jsx`. */
export default function Faqs() {
  return (
    <Stack direction="column" gap={2} py="2rem" id="faq">
      <Typography textAlign="center" fontWeight={700} fontSize="clamp(28px, 2vw, 40px)" color="var(--text-color)">
        Frequently asked questions
      </Typography>
      {faqs.map((faq) => {
        const half = Math.ceil(faq.items.length / 2);
        return (
          <Box key={faq.id}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, opacity: 0.5, py: 2 }}>
              {faq.icon}
              <Typography fontWeight={700} fontSize={16} color="var(--text-color)">
                {faq.title}
              </Typography>
            </Box>
            <Box display="grid" gridTemplateColumns={{ xl: "repeat(2, 1fr)", xs: "1fr" }} gap={1}>
              <Stack direction="column" gap={1}>
                {faq.items.slice(0, half).map((item) => (
                  <FaqItem key={item.id} faq={item} />
                ))}
              </Stack>
              <Stack direction="column" gap={1}>
                {faq.items.slice(half).map((item) => (
                  <FaqItem key={item.id} faq={item} />
                ))}
              </Stack>
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}

const FaqItem = ({ faq }: { faq: FaqItemData }) => {
  const { mode } = useColorScheme();
  const [open, setOpen] = useState(false);
  const toggle = (state: boolean) => () => setOpen(state);

  return (
    <ListItem disableGutters disablePadding>
      <ListItemButton
        sx={{ backgroundColor: mode === "light" ? "var(--background-color)" : "var(--dark-background-color)", borderRadius: "8px", flexDirection: "column" }}
        onClick={toggle(!open)}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" width="100%">
          <ListItemText primary={faq.title} slotProps={{ primary: { fontWeight: 700, fontSize: "14px", color: "var(--text-color)" } }} />
          {open ? <Remove fontSize="small" /> : <Add fontSize="small" />}
        </Stack>
        <Collapse in={open} sx={{ "& p": { fontSize: "12px" }, "& img": { width: "100%", height: "auto" }, width: "100%" }}>
          <Box py={1}>{faq.content()}</Box>
        </Collapse>
      </ListItemButton>
    </ListItem>
  );
};
