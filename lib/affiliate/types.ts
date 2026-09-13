/** Shared domain types for the Motion Flow subscription affiliate program. */

export type AffiliateRecurringMode = "first_only" | "all";
export type AffiliateStatus = "active" | "inactive";
export type AffiliateCommissionStatus = "pending" | "approved" | "reversed";
export type AffiliatePayoutStatus = "pending" | "paid";

export interface Affiliate {
  id: number;
  /** NULL until the invited partner accepts and we link their account. */
  userId: number | null;
  email: string;
  name: string;
  socialUrl: string | null;
  slug: string;
  commissionPercent: number;
  recurringMode: AffiliateRecurringMode;
  status: AffiliateStatus;
  payoneerEmail: string | null;
  inviteTokenSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AffiliateCommission {
  id: number;
  affiliateId: number;
  buyerUserId: number;
  paymentId: string;
  subscriptionId: string | null;
  plan: string | null;
  billingPeriod: string | null;
  grossAmount: number;
  paddleFee: number;
  netAmount: number;
  commissionPercent: number;
  /** Negative on reversals (refund / chargeback). */
  commissionAmount: number;
  currency: string;
  status: AffiliateCommissionStatus;
  createdAt: string;
}

/** Commission row joined with the buyer, for the admin partner card / partner cabinet. */
export interface AffiliateCommissionWithBuyer extends AffiliateCommission {
  buyerEmail: string | null;
  buyerName: string | null;
  buyerRegisteredAt: string | null;
  /** False when the same buyer already had an earlier commission row. */
  isFirstPayment: boolean;
}

export interface AffiliatePayout {
  id: number;
  affiliateId: number;
  /** YYYY-MM-DD, first day of the paid calendar month (UTC). */
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: AffiliatePayoutStatus;
  paidAt: string | null;
  paidBy: number | null;
}

export interface AffiliateCreateInput {
  name: string;
  email: string;
  socialUrl: string | null;
  slug: string;
  commissionPercent: number;
  recurringMode: AffiliateRecurringMode;
}

export interface AffiliateUpdateInput {
  name?: string;
  socialUrl?: string | null;
  commissionPercent?: number;
  recurringMode?: AffiliateRecurringMode;
  status?: AffiliateStatus;
}

/** Aggregated numbers for one affiliate over a period. */
export interface AffiliatePeriodStats {
  commissionTotal: number;
  paymentsCount: number;
  buyersCount: number;
  clicks: number;
  signups: number;
}
