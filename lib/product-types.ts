/** Row shape for `marketplace_items` (MySQL) — matches API/DB JSON. */
export interface ProductFiles {
  main?: string;
  image?: string;
  video?: string;
}

export interface Product {
  id: number;
  author_id: number;
  access: number;
  price: number;
  team: string | null;
  exclusive: number;
  subscription: number;
  index_category_slug: string;
  sub_category_slug: string;
  name: string;
  description: string;
  description_html: string | null;
  description_json: Record<string, string>;
  tags: string;
  has_qty: number;
  attributes: Record<string, string>;
  extra: string | null;
  json_args: string | null;
  files: ProductFiles;
  has_demo: number | null;
  demo_url: string | null;
  has_external: number | null;
  external_domain: string | null;
  external_url: string | null;
  youtube_preview: string | null;
  discount_price: number | null;
  discount_start: string | null;
  discount_end: string | null;
  created_at: string;
  updated_at: string;
}
