import { ContentPaste, ReportGmailerrorred } from "@mui/icons-material";
import { Link, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { motionflowMainSiteUrl } from "@/lib/motionflow-urls";

export interface FaqItemData {
  id: number;
  title: string;
  content: () => ReactNode;
}

export interface FaqGroup {
  id: number;
  title: string;
  icon: ReactNode;
  items: FaqItemData[];
}

/** Port of `resources/js/premieregal/entities/faqs.jsx`. */
export const faqs: FaqGroup[] = [
  {
    id: 1,
    title: "General",
    icon: <ContentPaste />,
    items: [
      {
        id: 1,
        title: "Does it work with both Mac and PC (Windows)?",
        content: () => <Typography>Yes, it works with both Mac and PC (Windows).</Typography>,
      },
      {
        id: 2,
        title: "Where is my extension authorization token located?",
        content: () => (
          <Typography>
            Your token is located in the{" "}
            <Link href={motionflowMainSiteUrl("/profile/subscriptions")}>My subscription</Link> section.
          </Typography>
        ),
      },
      {
        id: 3,
        title: "What license type does the Gal Toolkit MAX subscription have?",
        content: () => (
          <Typography>
            Any type of subscription (monthly, annual) and Lifetime purchase have a commercial license
          </Typography>
        ),
      },
      {
        id: 4,
        title: "What does a commercial license include?",
        content: () => (
          <Typography>
            Projects for business (studio, team) that uses templates for processing into commercial projects
            for other customers, or creates its own products (in other areas) on a commercial basis.
          </Typography>
        ),
      },
      {
        id: 5,
        title: "What is the minimum software version needed?",
        content: () => (
          <Typography>
            You must have Premiere Pro 2023 and After Effects 2023 or higher installed for using the Gal
            Toolkit MAX.
          </Typography>
        ),
      },
      {
        id: 6,
        title: "Can I use the Toolkit on more than one of my devices?",
        content: () => (
          <Typography>
            You can use Toolkit MAX on up to three devices simultaneously. If you log in on a fourth device,
            the first device will be automatically log out.
          </Typography>
        ),
      },
      {
        id: 7,
        title: "How will I be notified about product updates?",
        content: () => (
          <Typography>
            All updates are downloaded automatically, so no additional action is required. After updating,
            you will see a pop-up window with information about the update.
          </Typography>
        ),
      },
      {
        id: 8,
        title: "Do I need to install fonts like for the regular Toolkit version?",
        content: () => (
          <Typography>No, in the MAX version, all fonts are installed automatically during installation.</Typography>
        ),
      },
    ],
  },
  {
    id: 3,
    title: "Troubleshooting",
    icon: <ReportGmailerrorred />,
    items: [
      {
        id: 1,
        title: "My FX, Transitions, Overlays, and Color Grades are loading, but are not appearing in the timeline",
        content: () => (
          <Typography>
            <b>macOS</b> - Check if Premiere permissions are enabled in Mac preferences.
            <br />
            <code>{`Mac Settings > Privacy & Security > Accessibility`}</code>
            <br />
            <b>Windows</b> - contact support using the form below
          </Typography>
        ),
      },
    ],
  },
];
