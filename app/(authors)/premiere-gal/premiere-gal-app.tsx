"use client";

import { Box, Container } from "@mui/material";
import { useEffect } from "react";
import { PremiereGalMainHeader } from "@/components/premiere-gal-main-header";
import Content from "./components/Content";
import Sidebar from "./components/Sidebar";

/** Port of `resources/js/premieregal/App.jsx`. */
export default function PremiereGalApp() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const element = document.querySelector(hash);
    if (!element) return;
    const timeout = setTimeout(() => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <>
      <PremiereGalMainHeader />
      <Container maxWidth="xl" sx={{ mx: "auto", py: "2rem" }}>
        <Box
          sx={{
            display: "grid",
            width: "100%",
            alignItems: "start",
            gap: { xs: 2, md: 2, lg: 2.5 },
            gridTemplateColumns: {
              xs: "1fr",
              md: "minmax(0, 1fr) minmax(220px, 34%)",
              lg: "minmax(0, 1fr) minmax(260px, 32%)",
              xl: "minmax(0, 1fr) minmax(280px, 28rem)",
            },
          }}
        >
          <Box sx={{ minWidth: 0, width: "100%" }}>
            <Content />
          </Box>
          <Sidebar />
        </Box>
      </Container>
    </>
  );
}
