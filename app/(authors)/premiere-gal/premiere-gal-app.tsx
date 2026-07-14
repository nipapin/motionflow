"use client";

import { Container, Stack } from "@mui/material";
import { useEffect } from "react";
import { PremiereGalMainHeader } from "@/components/premiere-gal-main-header";
import Content from "./components/Content";
import Sidebar from "./components/Sidebar";
import { useMobile } from "./hooks/use-mobile";

/** Port of `resources/js/premieregal/App.jsx`. */
export default function PremiereGalApp() {
  const isMobile = useMobile();

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
        <Stack direction={isMobile ? "column" : "row"} gap={2} alignItems="flex-start">
          <Content />
          <Sidebar />
        </Stack>
      </Container>
    </>
  );
}
