/** Client-safe labels for the admin Users section. */

export const ADMIN_USER_ACCESS_OPTIONS = [
  { value: 0, label: "Buyer" },
  { value: 1, label: "Partner" },
  { value: 2, label: "Author" },
  { value: 100, label: "Admin" },
] as const;

export function accessRoleLabel(access: number): string {
  if (access === 100) return "Admin";
  if (access >= 2) return "Author";
  if (access >= 1) return "Partner";
  return "Buyer";
}

export function formatAdminDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function entitlementSourceLabel(system: string | null | undefined): "admin" | "paddle" | "other" {
  const v = (system ?? "").trim().toLowerCase();
  if (v === "admin") return "admin";
  if (v === "paddle") return "paddle";
  return "other";
}

export function subscriptionStatusLabel(status: number): string {
  if (status === 1) return "Active";
  if (status === -1) return "Cancelled";
  return "Revoked";
}

export const ADMIN_USERS_PAGE_SIZE = 50;

export const ADMIN_USER_ROLE_FILTERS = [
  { value: "all", label: "All" },
  { value: "buyer", label: "Buyer" },
  { value: "partner", label: "Partner" },
  { value: "author", label: "Author" },
  { value: "admin", label: "Admin" },
] as const;

export type AdminUserRoleFilter = (typeof ADMIN_USER_ROLE_FILTERS)[number]["value"];

export const ADMIN_USER_GOOGLE_FILTERS = [
  { value: "all", label: "All" },
  { value: "linked", label: "Linked" },
  { value: "none", label: "Not linked" },
] as const;

export type AdminUserGoogleFilter = (typeof ADMIN_USER_GOOGLE_FILTERS)[number]["value"];

export const ADMIN_USER_VERIFIED_FILTERS = [
  { value: "all", label: "All" },
  { value: "verified", label: "Verified" },
  { value: "unverified", label: "Unverified" },
] as const;

export type AdminUserVerifiedFilter =
  (typeof ADMIN_USER_VERIFIED_FILTERS)[number]["value"];

export function parseAdminUserRoleFilter(raw: string | null | undefined): AdminUserRoleFilter {
  return ADMIN_USER_ROLE_FILTERS.some((f) => f.value === raw)
    ? (raw as AdminUserRoleFilter)
    : "all";
}

export function parseAdminUserGoogleFilter(
  raw: string | null | undefined,
): AdminUserGoogleFilter {
  return ADMIN_USER_GOOGLE_FILTERS.some((f) => f.value === raw)
    ? (raw as AdminUserGoogleFilter)
    : "all";
}

export function parseAdminUserVerifiedFilter(
  raw: string | null | undefined,
): AdminUserVerifiedFilter {
  return ADMIN_USER_VERIFIED_FILTERS.some((f) => f.value === raw)
    ? (raw as AdminUserVerifiedFilter)
    : "all";
}

export const ADMIN_USER_SOLD_FILTERS = [
  { value: "all", label: "All" },
  { value: "has", label: "Has purchases" },
  { value: "none", label: "No purchases" },
] as const;

export type AdminUserSoldFilter = (typeof ADMIN_USER_SOLD_FILTERS)[number]["value"];

export const ADMIN_USER_SUB_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Has active" },
  { value: "none", label: "No active" },
] as const;

export type AdminUserSubFilter = (typeof ADMIN_USER_SUB_FILTERS)[number]["value"];

export const ADMIN_USER_SORT_FIELDS = [
  "id",
  "name",
  "email",
  "access",
  "soldItems",
  "subscription",
  "createdAt",
] as const;

export type AdminUserSortField = (typeof ADMIN_USER_SORT_FIELDS)[number];
export type AdminUserSortDir = "asc" | "desc";

export function parseAdminUserSoldFilter(
  raw: string | null | undefined,
): AdminUserSoldFilter {
  return ADMIN_USER_SOLD_FILTERS.some((f) => f.value === raw)
    ? (raw as AdminUserSoldFilter)
    : "all";
}

export function parseAdminUserSubFilter(
  raw: string | null | undefined,
): AdminUserSubFilter {
  return ADMIN_USER_SUB_FILTERS.some((f) => f.value === raw)
    ? (raw as AdminUserSubFilter)
    : "all";
}

export function parseAdminUserSortField(
  raw: string | null | undefined,
): AdminUserSortField {
  return ADMIN_USER_SORT_FIELDS.some((f) => f === raw)
    ? (raw as AdminUserSortField)
    : "id";
}

export function parseAdminUserSortDir(
  raw: string | null | undefined,
): AdminUserSortDir {
  return raw === "asc" ? "asc" : "desc";
}

export function parseAdminUserDateParam(
  raw: string | null | undefined,
): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

export type AdminUserListRow = {
  id: number;
  name: string;
  email: string;
  access: number;
  createdAt: string | null;
  soldItemsCount: number;
  activeSubscription: string | null;
};

export type AdminUserDetail = {
  id: number;
  name: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  access: number;
  mailing: number | null;
  mailingOptIn: boolean;
  googleId: string | null;
  emailVerifiedAt: string | null;
  createdAt: string | null;
  balance: number;
  extraGenerations: number;
};

export type AdminUserPurchaseRow = {
  id: number;
  itemId: number;
  itemName: string | null;
  authorId: number;
  status: number;
  system: string;
  purchaseCode: string | null;
  soldPrice: number;
  createdAt: string | null;
};

export type AdminUserSubscriptionRow = {
  id: number;
  authorId: number | null;
  status: number;
  plan: string | null;
  system: string;
  subscriptionId: string;
  paymentId: string | null;
  paddleProductName: string | null;
  paddlePriceId: string | null;
  endsAt: string | null;
  createdAt: string | null;
  label: string;
};

export type AdminMarketItemHit = {
  id: number;
  name: string;
  authorId: number;
  price: number;
  slug: string;
};

