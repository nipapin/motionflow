import type { SxProps, Theme } from "@mui/material";

export interface BlockImage {
  src: string;
  sx: { size: string; position: string };
}

export interface BlockVideo {
  src: string;
  mode: "light" | "dark";
}

export interface Block {
  id: number;
  sx: SxProps<Theme>;
  title: { text: string; sx: SxProps<Theme> };
  tagline: string;
  image?: BlockImage[];
  video?: BlockVideo[];
}

/** Port of `resources/js/premieregal/entities/blocks.jsx`. */
export const blocks: Block[] = [
  {
    id: 1,
    sx: {
      display: "flex",
      gap: 1,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      aspectRatio: "760/398",
      gridColumn: { xs: "span 2", xl: "span 2" },
    },
    title: { text: "Adaptive Design", sx: {} },
    tagline: "",
    video: [
      { src: "/premiere-gal/assets/video/autoresize_light.mp4", mode: "light" },
      { src: "/premiere-gal/assets/video/autoresize_dark.mp4", mode: "dark" },
    ],
  },
  {
    id: 2,
    sx: {
      display: "flex",
      gap: 1,
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "flex-start",
      aspectRatio: "375/398",
      gridColumn: { xs: "span 1", xl: "span 1" },
    },
    title: { text: "Duration\nControl", sx: {} },
    tagline:
      "Quickly control animation timing and adjust durations with simple, intuitive controls designed to keep your workflow fast and flexible.",
    image: [
      {
        src: "url(/premiere-gal/assets/blocks/duration_control.png)",
        sx: { size: "cover", position: "right 80px" },
      },
    ],
  },
  {
    id: 3,
    sx: {
      display: "flex",
      gap: 1,
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "flex-start",
      aspectRatio: "375/398",
      gridColumn: { xs: "span 1", xl: "span 1" },
    },
    title: { text: "Quick\nCustomization", sx: {} },
    tagline:
      "Quickly customize each element to match your project style. Make changes instantly and keep your workflow fast without diving into complex settings.",
    image: [
      {
        src: "url(/premiere-gal/assets/blocks/quick_customization.png)",
        sx: { size: "90%", position: "110% bottom" },
      },
    ],
  },
  {
    id: 4,
    sx: {
      display: "flex",
      gap: 1,
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "flex-start",
      aspectRatio: "375/398",
      gridColumn: { xs: "span 1", xl: "span 1" },
    },
    title: { text: "Font Auto\nInstallation", sx: {} },
    tagline:
      "All required fonts are installed automatically with the pack. No manual downloads or setup needed — everything works instantly inside your project.",
    image: [
      {
        src: "url(/premiere-gal/assets/blocks/font_installation.png)",
        sx: { size: "", position: "right bottom" },
      },
    ],
  },
  {
    id: 5,
    sx: {
      display: "flex",
      gap: 1,
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "flex-start",
      aspectRatio: "375/398",
      gridColumn: { xs: "span 1", xl: "span 1" },
    },
    title: { text: "Direct\nDownload", sx: {} },
    tagline:
      "Download assets directly through the extension and apply them to your project without leaving your editing workspace.",
    image: [
      {
        src: "url(/premiere-gal/assets/blocks/direct_download.png)",
        sx: { position: "60px 60px", size: "100%" },
      },
    ],
  },
];
