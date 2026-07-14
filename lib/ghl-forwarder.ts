import "server-only";

/**
 * Port of Laravel `App\Services\GoHighLevelForwarder`. Disabled by default —
 * set `GHL_FORWARD_ENABLED=true` and `GHL_FORWARD_URL` to activate.
 */
export async function sendGhlEvent(
  eventType: "monthly_purchase" | "yearly_purchase" | "lifetime_purchase" | "refund" | "cancellation" | "free_download",
  fields: Record<string, unknown>,
): Promise<void> {
  const enabled = process.env.GHL_FORWARD_ENABLED === "true";
  const url = process.env.GHL_FORWARD_URL;
  if (!enabled || !url) return;

  const body = {
    event_type: eventType,
    product: "Gal Toolkit Max",
    timestamp: new Date().toISOString(),
    ...fields,
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
