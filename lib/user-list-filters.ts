import { parseAdminUserDateParam, parseAdminUserSoldFilter, parseAdminUserSubFilter, parseAdminUserVerifiedFilter } from "@/lib/admin-users-shared";

export const MAILING_FILTERS = [
  { value: "all", label: "All" },
  { value: "opted_in", label: "Opted in" },
  { value: "opted_out", label: "Not opted in" },
] as const;
export const DEVICE_FILTERS = [
  { value: "all", label: "All" },
  { value: "has", label: "Has devices" },
  { value: "none", label: "No devices" },
] as const;
export const SUB_SOURCE_FILTERS = [
  { value: "all", label: "All" },
  { value: "admin", label: "Admin" },
  { value: "paddle", label: "Paddle" },
] as const;
export type MailingFilter = (typeof MAILING_FILTERS)[number]["value"];
export type ExtensionUserFilters = {
  sub: "all" | "active" | "none";
  source: (typeof SUB_SOURCE_FILTERS)[number]["value"];
  sold: "all" | "has" | "none";
  devices: (typeof DEVICE_FILTERS)[number]["value"];
  mailing: MailingFilter;
  verified: "all" | "verified" | "unverified";
  registeredFrom: string;
  registeredTo: string;
  seenFrom: string;
  seenTo: string;
};
export const DEFAULT_EXTENSION_USER_FILTERS: ExtensionUserFilters = {
  sub: "all", source: "all", sold: "all", devices: "all", mailing: "all", verified: "all",
  registeredFrom: "", registeredTo: "", seenFrom: "", seenTo: "",
};
export function parseMailingFilter(raw: string | null | undefined): MailingFilter {
  return raw === "opted_in" || raw === "opted_out" ? raw : "all";
}
export function parseExtensionUserFilters(params: URLSearchParams): ExtensionUserFilters {
  const source = params.get("source");
  const devices = params.get("devices");
  return {
    sub: parseAdminUserSubFilter(params.get("sub")),
    source: source === "admin" || source === "paddle" ? source : "all",
    sold: parseAdminUserSoldFilter(params.get("sold")),
    devices: devices === "has" || devices === "none" ? devices : "all",
    mailing: parseMailingFilter(params.get("mailing")),
    verified: parseAdminUserVerifiedFilter(params.get("verified")),
    registeredFrom: parseAdminUserDateParam(params.get("registeredFrom")) ?? "",
    registeredTo: parseAdminUserDateParam(params.get("registeredTo")) ?? "",
    seenFrom: parseAdminUserDateParam(params.get("seenFrom")) ?? "",
    seenTo: parseAdminUserDateParam(params.get("seenTo")) ?? "",
  };
}
export function mailingFilterSql(value: MailingFilter): string {
  if (value === "opted_in") return "u.mailing = 0";
  if (value === "opted_out") return "(u.mailing IS NULL OR u.mailing <> 0)";
  return "";
}
export function validateUserDateRanges(params: URLSearchParams): string | null {
  for (const [from, to] of [["registeredFrom", "registeredTo"], ["seenFrom", "seenTo"]]) {
    for (const key of [from, to]) {
      const value = params.get(key);
      if (value && !parseAdminUserDateParam(value)) return "Invalid date";
    }
    if (params.get(from) && params.get(to) && params.get(from)! > params.get(to)!) {
      return "The start date must be on or before the end date";
    }
  }
  return null;
}
