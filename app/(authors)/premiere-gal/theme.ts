import { createTheme } from "@mui/material/styles";

/** Mirrors `resources/js/premieregal/theme/themeConfig.js` from the Laravel Vite app. */
export const premiereGalTheme = createTheme({
  colorSchemeSelector: "data-mui-color-scheme",
  colorSchemes: {
    light: {
      palette: {
        mode: "light",
        primary: {
          main: "#DE7ABE",
        },
        background: {
          default: "#FFFFFF",
          paper: "#F0F1F9",
        },
      },
    },
    dark: {
      palette: {
        mode: "dark",
        primary: {
          main: "#DE7ABE",
        },
        background: {
          default: "#111015",
          paper: "#14121A",
        },
        text: {
          primary: "#ffffff",
        },
      },
    },
  },
  typography: {
    fontFamily: "Inter, sans-serif",
    fontSize: 14,
  },
  components: {
    MuiLink: {
      styleOverrides: {
        root: {
          textDecoration: "none",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          whiteSpace: "pre-line",
          lineHeight: "1.1",
        },
      },
    },
  },
} as Parameters<typeof createTheme>[0]);
