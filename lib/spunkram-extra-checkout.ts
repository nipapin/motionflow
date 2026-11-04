import "server-only";
import { createHmac } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

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
  try {
    const { payload } = await jwtVerify(ticket, signingKey(), {
      audience,
      algorithms: ["HS256"],
      requiredClaims: ["exp", "sub"],
    });
    const id = Number(payload.sub);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
