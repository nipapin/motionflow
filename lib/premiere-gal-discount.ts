import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { getOwnedItemIdSet } from "@/lib/purchases";
import { PREMIERE_GAL_AUTHOR_ID } from "@/lib/premiere-gal-paddle-config";

/**
 * Port of Laravel `PaddleCustomCheckoutController::resolveCheckoutDiscountForUser`.
 *
 * Owners of old Gal Toolkit marketplace items get 50% off yearly/lifetime once
 * (not after they have ever held Toolkit MAX). Beta testers get 75%.
 */
const QUALIFYING_MARKETPLACE_ITEM_IDS = [1102, 813] as const;

const PADDLE_DISCOUNT_ID_FOR_QUALIFIED_OWNERS = "dsc_01knh2mcpc7365xzqexhy9ps48";
const PADDLE_DISCOUNT_PERCENT_FOR_QUALIFIED_OWNERS = 50;

const BETA_TESTER_EMAILS = [
  "phil@lgmanor.com",
  "pryan576.pr@gmail.com",
  "troyyoung@me.com",
  "pixelframesolution@gmail.com",
  "davidspearman@live.com",
  "markotomic@yahoo.com",
  "chalk.ruby8834@eagereverest.com",
  "stephen@imagebysteve.co.uk",
  "papin201212@gmail.com",
];

const PADDLE_DISCOUNT_ID_BETA_TESTERS = "dsc_01knm46vgsxsgqdedfmhgzpngt";
const PADDLE_DISCOUNT_PERCENT_BETA_TESTERS = 75;

export interface PremiereGalPageSets {
  discount_id: string | null;
  discount_percent: number | null;
  is_beta_tester: boolean;
  had_toolkit_max: boolean;
  has_qualifying_purchase: boolean;
}

const EMPTY_PAGE_SETS: PremiereGalPageSets = {
  discount_id: null,
  discount_percent: null,
  is_beta_tester: false,
  had_toolkit_max: false,
  has_qualifying_purchase: false,
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
  const owned = await getOwnedItemIdSet(user.id, [...QUALIFYING_MARKETPLACE_ITEM_IDS]);
  const hasQualifyingPurchase = owned.size > 0;

  if (email && BETA_TESTER_EMAILS.includes(email)) {
    return {
      discount_id: PADDLE_DISCOUNT_ID_BETA_TESTERS,
      discount_percent: PADDLE_DISCOUNT_PERCENT_BETA_TESTERS,
      is_beta_tester: true,
      had_toolkit_max: hadToolkitMax,
      has_qualifying_purchase: hasQualifyingPurchase,
    };
  }

  const discountApplies = hasQualifyingPurchase && !hadToolkitMax;

  return {
    discount_id: discountApplies ? PADDLE_DISCOUNT_ID_FOR_QUALIFIED_OWNERS : null,
    discount_percent: discountApplies ? PADDLE_DISCOUNT_PERCENT_FOR_QUALIFIED_OWNERS : null,
    is_beta_tester: false,
    had_toolkit_max: hadToolkitMax,
    has_qualifying_purchase: hasQualifyingPurchase,
  };
}
