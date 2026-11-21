import "server-only";
import { createHmac } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { getActiveAuthorSubscription } from "@/lib/cep-entitlements";
import { SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";

const audience = "spunkram-cep-extra-checkout";

function signingKey() {
  const secret = process.env.AUTH_SECRET || process.env.APP_KEY;
  if (!secret) throw new Error("Checkout signing key is unavailable");
  return createHmac("sha256", secret).update(audience).digest();
}

export function signExtraCheckout(userId: number) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setAudience(audience)
    .setExpirationTime("10m")
    .sign(signingKey());
}

export async function extraCheckoutBuyer(ticket?: string) {
  if (typeof ticket !== "string" || ticket.length > 512) return null;
  let id: number;
  try {
    const { payload } = await jwtVerify(ticket, signingKey(), {
      audience,
      algorithms: ["HS256"],
      requiredClaims: ["exp", "sub"],
    });
    id = Number(payload.sub);
  } catch {
    return null;
  }
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const subscription = await getActiveAuthorSubscription(id, SPUNKRAM_AUTHOR_ID);
  return subscription.active ? id : null;
}
