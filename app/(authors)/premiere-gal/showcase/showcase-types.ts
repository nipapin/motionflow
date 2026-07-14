export interface ShowcaseNode {
  name: string;
  href: string;
  type: "folder" | "video" | "audio";
  children: ShowcaseNode[];
  counter?: number;
  media?: string;
  description?: string;
  aspect?: string;
}
