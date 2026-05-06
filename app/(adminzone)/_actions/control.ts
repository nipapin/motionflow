"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAdmin, isInvestor } from "@/lib/auth/access-control";
import {
  type ControlActionId,
  type ControlActionResult,
  requestInvestmentMoney,
  runControlAction,
} from "@/lib/admin/control";

async function requireStaff() {
  const u = await getSessionUser();
  if (!u || !isInvestor(u)) throw new Error("Forbidden");
  return u;
}

function revalidate() {
  revalidatePath("/adminzone/control");
  revalidatePath("/adminzone/dashboard");
  revalidatePath("/adminzone/payouts", "layout");
  revalidatePath("/adminzone/items_access", "layout");
}

export async function runControlActionServerAction(id: ControlActionId): Promise<ControlActionResult> {
  const user = await requireStaff();
  const result = await runControlAction(id, { isAdmin: isAdmin(user) });
  if (result.ok) revalidate();
  return result;
}

export async function requestInvestmentAction(input: {
  investorUserId: number;
  amount: number;
  description: string;
}): Promise<ControlActionResult> {
  const user = await requireStaff();
  const r = await requestInvestmentMoney({
    ...input,
    staffId: user.id,
  });
  if (r.ok) {
    revalidatePath("/adminzone/control");
    revalidatePath("/adminzone/investment", "layout");
  }
  return r;
}
