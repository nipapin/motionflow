export type AudienceField = { name: string; label: string; kind: "text" | "number" | "date" };
export const AUDIENCE_OPERATORS = {
  text: ["eq", "ne", "contains", "not_contains", "starts", "ends", "empty", "not_empty"],
  number: ["eq", "ne", "gt", "gte", "lt", "lte", "empty", "not_empty"],
  date: ["eq", "ne", "gt", "gte", "lt", "lte", "empty", "not_empty"],
} as const;
export const AUDIENCE_OPERATOR_LABELS: Record<string, string> = {
  eq: "Equals", ne: "Does not equal", contains: "Contains", not_contains: "Does not contain",
  starts: "Starts with", ends: "Ends with", gt: "Greater / after", gte: "At least / on or after",
  lt: "Less / before", lte: "At most / on or before", empty: "Is empty", not_empty: "Is not empty",
};
export type CampaignAudience = {
  authorIds: number[]; subscription: "all" | "has" | "none" | "active" | "no_active";
  verified: "all" | "verified" | "unverified"; mailing: "all" | "opted_in" | "opted_out";
  purchases: "all" | "has" | "none"; devices: "all" | "has" | "none";
  role: "all" | "buyer" | "partner" | "author" | "admin";
  match: "all" | "any"; rules: { field: string; operator: string; value: string }[];
};
export const emptyCampaignAudience = (): CampaignAudience => ({
  authorIds: [], subscription: "all", verified: "all", mailing: "opted_in",
  purchases: "all", devices: "all", role: "all", match: "all", rules: [],
});
export type CampaignDelivery = { provider: "resend" | "mailgun"; from_email: string; from_name: string; mailing_list?: string | null };
export type CampaignMailOptions = {
  resend: { configured: boolean; addresses: string[]; domains: string[] };
  mailgun: { configured: boolean; addresses: string[]; domains: string[] };
};
export type AudiencePreview = { total: number; users: { id: number; name: string; email: string }[]; recipients_source?: string; mailing_list?: string; recipients?: number };
