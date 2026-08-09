"use client";

import { DarkMode, LightMode } from "@mui/icons-material";
import MenuIcon from "@mui/icons-material/Menu";
import {
  ClickAwayListener,
  IconButton,
  Link,
  Paper,
  Popper,
  Stack,
  Typography,
  useColorScheme,
  useTheme,
} from "@mui/material";
import { useState } from "react";
import { useMobile } from "../hooks/use-mobile";

const links = [
  { label: "Features", href: "#features" },
  { label: "How to Use", href: "#use" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact Us", href: "#contact" },
];

/** Port of `resources/js/premieregal/components/Links.jsx`. */
export default function Links() {
  const isMobile = useMobile();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const { mode, setMode } = useColorScheme();
  const theme = useTheme();

  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleToggleMode = () => {
    setMode(mode === "light" ? "dark" : "light");
  };

  const renderLinks = () =>
    links.map((link) => (
      <Link
        key={link.label}
        href={link.href}
        onClick={handleClose}
        sx={{
          color: mode === "dark" ? "white" : "black",
          whiteSpace: "nowrap",
          flexShrink: 0,
          "&:hover": {
            textDecoration: "none",
            color: mode === "dark" ? "primary.main" : "secondary.main",
          },
        }}
      >
        <Typography fontWeight={400} fontSize="clamp(11px, 1.05vw, 14px)" whiteSpace="nowrap" lineHeight={1.2}>
          {link.label}
        </Typography>
      </Link>
    ));

  if (!mode) return null;

  return (
    <ClickAwayListener onClickAway={handleClose}>
      <Stack
        direction="row"
        alignItems="center"
        gap={{ xs: 1, md: 1, lg: 1.5, xl: 2 }}
        ml="auto"
        sx={{ flexShrink: 0, whiteSpace: "nowrap", minWidth: 0 }}
      >
        {isMobile ? (
          <>
            <IconButton size="small" onClick={handleToggleMode}>
              {mode === "light" ? <DarkMode fontSize="small" /> : <LightMode fontSize="small" />}
            </IconButton>
            <IconButton size="small" onClick={handleClick}>
              <MenuIcon fontSize="small" />
            </IconButton>
            <Popper open={open} anchorEl={anchorEl} placement="bottom-end" sx={{ zIndex: theme.zIndex.modal }}>
              <Paper
                sx={{
                  p: 2,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  alignItems: "flex-end",
                  width: "150px",
                  borderRadius: "8px",
                }}
              >
                {renderLinks()}
              </Paper>
            </Popper>
          </>
        ) : (
          <>
            {renderLinks()}
            <IconButton size="small" onClick={handleToggleMode} sx={{ flexShrink: 0 }}>
              {mode === "light" ? <DarkMode fontSize="small" /> : <LightMode fontSize="small" />}
            </IconButton>
          </>
        )}
      </Stack>
    </ClickAwayListener>
  );
}
