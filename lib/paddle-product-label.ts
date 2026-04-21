/**
 * Motion Flow subscription titles: edit the template only; keep exactly one `%ProductName%`.
 * Normalization strips Paddle billing labels and duplicate “Motionflow” / “Motion Flow” prefixes
 * so the plan stays in `subscription_systems.plan`, not in the title.
 */

export const PRODUCT_NAME_PLACEHOLDER = "%ProductName%";

/** Display string for catalog subscriptions; token is substituted at runtime. */
export const MOTIONFLOW_SUBSCRIPTION_TITLE_TEMPLATE = `Motion Flow ${PRODUCT_NAME_PLACEHOLDER}`;

/* --- normalization (single pipeline, not exported in pieces) --- */

const PAREN_SUFFIX =
  /\s*\(\s*(monthly|quarterly|annual|annually|yearly|lifetime|month|year|week|day)\s*\)\s*$/i;

const TRAILING_SEGMENT =
  /\s*[-–—/]\s*(monthly|quarterly|annual|annually|yearly|lifetime|per\s+month|per\s+year)\s*$/i;

const TRAILING_WORD =
  /\s+(monthly|quarterly|quarter|annual|annually|yearly|year|lifetime|weekly|week|daily|day|month)\s*$/i;

function stripBillingTail(name: string): string {
  let s = name.trim();
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(PAREN_SUFFIX, "").trim();
    s = s.replace(TRAILING_SEGMENT, "").trim();
    s = s.replace(TRAILING_WORD, "").trim();
  }
  return s;
}

function stripLeadingMotionflowTokens(name: string): string {
  let s = name.trim();
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(/^(motionflow|motion\s+flow)\s+/i, "").trim();
  }
  return s;
}

/**
 * Raw Paddle `product.name` / `price.name` → token for DB and for `%ProductName%`.
 */
export function normalizePaddleProductNameToken(raw: string): string {
  const afterBilling = stripBillingTail(raw);
  const afterBrand = stripLeadingMotionflowTokens(afterBilling || raw.trim());
  return (afterBrand || afterBilling || raw.trim()).trim();
}

/**
 * Fills `MOTIONFLOW_SUBSCRIPTION_TITLE_TEMPLATE`; normalizes the token first.
 */
export function applyMotionflowProductTitleTemplate(productNameToken: string): string {
  const token =
    normalizePaddleProductNameToken(productNameToken) || productNameToken.trim() || "Subscription";
  if (!MOTIONFLOW_SUBSCRIPTION_TITLE_TEMPLATE.includes(PRODUCT_NAME_PLACEHOLDER)) {
    return token;
  }
  return MOTIONFLOW_SUBSCRIPTION_TITLE_TEMPLATE.replace(PRODUCT_NAME_PLACEHOLDER, token);
}
