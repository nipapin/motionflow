import { NextRequest, NextResponse } from "next/server";
import {
  bearerFromRequest,
  identityFromFormData,
  identityFromJsonBody,
  resolveCaptionsUser,
  type CaptionsIdentityInput,
  UNAUTHORIZED_CODE,
} from "@/lib/auth/resolve-captions-user";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import {
  getCepClientConfig,
  requireCepClientConfig,
} from "@/lib/cep-client-registry";
import { getActiveAuthorSubscription, cepAiGenerationsLimit } from "@/lib/cep-entitlements";
import {
  getCepSpunkramGenerationsStatus,
  getGenerationsStatus,
} from "@/lib/generations";
import {
  billableAccountRequiredResponse,
  isBillableCepUser,
} from "@/lib/cep-generations";

export const runtime = "nodejs";

async function readIdentity(req: NextRequest): Promise<CaptionsIdentityInput> {
  const bearer = bearerFromRequest(req);
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    return form ? { ...identityFromFormData(form), bearer } : { bearer };
  }
  if (req.method === "GET") {
    const { searchParams } = new URL(req.url);
    return {
      email: searchParams.get("email"),
      userId: searchParams.get("userId"),
      devToken: searchParams.get("devToken"),
      bearer,
    };
  }
  const body = await req.json().catch(() => null);
  return { ...identityFromJsonBody(body), bearer };
}

async function handleStatus(req: NextRequest) {
  try {
    const identity = await readIdentity(req);
    const user = await resolveCaptionsUser(identity);
    if (!user) {
      return NextResponse.json(
        { authenticated: false, code: UNAUTHORIZED_CODE },
        { status: 401 },
      );
    }

    if (typeof user.id !== "number") {
      // cep-dev has no billable quota — do not report fake unlimited credits.
      return billableAccountRequiredResponse();
    }

    // CEP Bearer → Spunkram author tier (5 free / 10 Editor / 100 Editor AI).
    const cepUser = identity.bearer
      ? await resolveCepBearerUser(identity.bearer)
      : null;
    if (cepUser) {
      const cfg =
        getCepClientConfig(cepUser.client) ??
        requireCepClientConfig("spunkram-cep");
      const authorSub = await getActiveAuthorSubscription(
        cepUser.id,
        cfg.authorId,
      );
      const monthlyLimit = cepAiGenerationsLimit(cfg, authorSub);
      const status = await getCepSpunkramGenerationsStatus(
        cepUser.id,
        monthlyLimit,
        authorSub.active,
      );
      return NextResponse.json({
        authenticated: true,
        source: "cep-bearer",
        ...status,
        plan: authorSub.active
          ? authorSub.tierId === "library"
            ? "spunkram_editor"
            : "spunkram_editor_ai"
          : "free",
      });
    }

    if (!isBillableCepUser(user)) {
      return billableAccountRequiredResponse();
    }

    const status = await getGenerationsStatus(user.id);
    return NextResponse.json({
      authenticated: true,
      source: user.source,
      ...status,
    });
  } catch (err) {
    console.error("[cep/generations]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not load generations" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handleStatus(req);
}

export async function POST(req: NextRequest) {
  return handleStatus(req);
}
