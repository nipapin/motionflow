import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { PREMIERE_GAL_AUTHOR_ID } from "@/lib/premiere-gal-paddle-config";

/**
 * Port of Laravel `PaddleCustomCheckoutController::resolveCheckoutDiscountForUser`.
 * `QUALIFYING_MARKETPLACE_ITEM_IDS` is empty in the source config, so the
 * "qualified owner" discount path is permanently dead there too — only the
 * beta-tester allowlist currently grants a discount.
 */
const BETA_TESTER_EMAILS = [
  "phil@lgmanor.com",
  "pryan576.pr@gmail.com",
];

const PADDLE_DISCOUNT_ID_BETA_TESTERS = "dsc_01knm46vgsxsgqdedfmhgzpngt";
const PADDLE_DISCOUNT_PERCENT_BETA_TESTERS = 75;

export interface PremiereGalPageSets {
  discount_id: string | null;
  discount_percent: number | null;
  is_beta_tester: boolean;
  had_toolkit_max: boolean;
}

const EMPTY_PAGE_SETS: PremiereGalPageSets = {
  discount_id: null,
  discount_percent: null,
  is_beta_tester: false,
  had_toolkit_max: false,
};

async function buyerHasEverHadSubscriptionForAuthor(buyerId: number, authorId: number): Promise<boolean> {
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT 1 FROM subscription_systems WHERE buyer_id = ? AND author_id = ? LIMIT 1",
    [buyerId, authorId],
  );
  return rows.length > 0;
}

export async function resolveCheckoutDiscountForUser(
  user: { id: number; email: string } | null,
): Promise<PremiereGalPageSets> {
  if (!user) return EMPTY_PAGE_SETS;

  const email = user.email.trim().toLowerCase();
  const hadToolkitMax = await buyerHasEverHadSubscriptionForAuthor(user.id, PREMIERE_GAL_AUTHOR_ID);

  if (email && BETA_TESTER_EMAILS.includes(email)) {
    return {
      discount_id: PADDLE_DISCOUNT_ID_BETA_TESTERS,
      discount_percent: PADDLE_DISCOUNT_PERCENT_BETA_TESTERS,
      is_beta_tester: true,
      had_toolkit_max: hadToolkitMax,
    };
  }

  return {
    discount_id: null,
    discount_percent: null,
    is_beta_tester: false,
    had_toolkit_max: hadToolkitMax,
  };
}
