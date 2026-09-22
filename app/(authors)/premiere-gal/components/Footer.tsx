import { Box, Link, Stack, Typography } from "@mui/material";
import { motionflowMainSiteUrl } from "@/lib/motionflow-urls";

const legalLinks = [
  { label: "Privacy Policy", href: motionflowMainSiteUrl("/privacy") },
  { label: "Terms of Use", href: motionflowMainSiteUrl("/terms") },
] as const;

/** Legal links to the main Motion Flow site — same pages as the main-site footer. */
export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        borderTop: "1px solid",
        borderColor: "divider",
        py: 3,
        px: { xs: 2, sm: 3 },
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems="center"
        justifyContent="space-between"
        gap={1.5}
        sx={{ maxWidth: "1536px", mx: "auto" }}
      >
        <Stack direction="row" flexWrap="wrap" justifyContent="center" gap={{ xs: 2, sm: 3 }}>
          {legalLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              sx={{
                color: "var(--link-color)",
                fontSize: 13,
                fontWeight: 400,
                "&:hover": {
                  color: "var(--text-color)",
                  textDecoration: "none",
                },
              }}
            >
              {link.label}
            </Link>
          ))}
        </Stack>
        <Typography fontSize={11} color="var(--link-color)" sx={{ whiteSpace: "nowrap" }}>
          {new Date().getFullYear()} Motion Flow. All rights reserved.
        </Typography>
      </Stack>
    </Box>
  );
}
