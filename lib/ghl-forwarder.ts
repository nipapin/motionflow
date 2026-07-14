import "server-only";

export type GhlEventType =
  | "monthly_purchase"
  | "yearly_purchase"
  | "lifetime_purchase"
  | "refund"
  | "cancellation"
  | "free_download";

/**
 * Internal event_type -> CC360's requested {event, plan} shape. Port of
 * Laravel `App\Services\GoHighLevelForwarder::EVENT_MAP` - keep the two in
 * sync if CC360's contract ever changes.
 */
const EVENT_MAP: Record<GhlEventType, { event: string; plan: string | null }> = {
  monthly_purchase: { event: "purchase", plan: "monthly" },
  yearly_purchase: { event: "purchase", plan: "yearly" },
  lifetime_purchase: { event: "purchase", plan: "lifetime" },
  cancellation: { event: "cancellation", plan: null },
  refund: { event: "refund", plan: null },
  free_download: { event: "free_download", plan: "none" },
};

/**
 * Port of Laravel `App\Services\GoHighLevelForwarder::send`. Disabled by
 * default — set `GHL_FORWARD_ENABLED=true` and `GHL_FORWARD_URL` to activate.
 *
 * `fields.tier` carries the plan for cancellation/refund (purchase events
 * already imply it via `eventType`). `fields.first_name`/`last_name` are
 * joined into `name`. Outgoing body matches CC360's requested webhook
 * contract exactly: `{event, email, name, plan, date}`.
 */
export async function sendGhlEvent(
  eventType: GhlEventType,
  fields: {
    tier?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    amount?: number | null;
    currency?: string | null;
  },
): Promise<void> {
  const enabled = process.env.GHL_FORWARD_ENABLED === "true";
  const url = process.env.GHL_FORWARD_URL;
  if (!enabled || !url) return;

  const mapped = EVENT_MAP[eventType];
  const name = [fields.first_name, fields.last_name].filter(Boolean).join(" ").trim();

  const body = {
    event: mapped.event,
    email: fields.email ?? null,
    name: name !== "" ? name : null,
    plan: fields.tier ?? mapped.plan ?? "none",
    date: new Date().toISOString(),
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.error("[ghl-forwarder] failed to send event:", eventType, err);
  }
}
