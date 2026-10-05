import "server-only";

export async function odinManagementRequest(query: URLSearchParams, body?: Record<string, unknown>) {
  const origin = process.env.ODIN_MANAGEMENT_ORIGIN?.trim();
  const secret = process.env.ODIN_MANAGEMENT_SECRET;
  if (!origin || !secret || secret.length < 32) throw new Error("ODIN_NOT_CONFIGURED");
  let base: URL;
  try { base = new URL(origin); }
  catch { throw new Error("ODIN_NOT_CONFIGURED"); }
  // Both sites may run on one host. HTTP is permitted only on loopback.
  if (base.username || base.password || (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname)))) throw new Error("ODIN_NOT_CONFIGURED");
  const url = new URL("/api/integrations/motionflow/users", base);
  url.search = query.toString();
  const response = await fetch(url, {
    method: body ? "POST" : "GET", cache: "no-store", redirect: "error",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(body ? 30000 : 15000),
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error("NOT_FOUND");
    if (response.status === 401 || response.status === 403) throw new Error("ODIN_UNAUTHORIZED");
    const data = await response.json().catch(() => null);
    if (["MANUAL_SUBSCRIPTION_REQUIRED", "SUBSCRIPTION_BUSY", "PAYPRO_NOT_CONFIGURED", "PAYPRO_CANNOT_RENEW", "PAYPRO_UNAVAILABLE"].includes(data?.error)) throw new Error(data.error);
    if (response.status === 400) throw new Error("INVALID_INPUT");
    if (data?.error === "MANAGEMENT_DISABLED") throw new Error("ODIN_MANAGEMENT_DISABLED");
    throw new Error("ODIN_UNAVAILABLE");
  }
  try { return await response.json(); }
  catch { throw new Error("ODIN_UNAVAILABLE"); }
}
