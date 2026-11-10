import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

export type OdinAiOperationContext = { userId: string; periodId: string; operationId: string; amount: number };
export const odinAiOperationContext = new AsyncLocalStorage<OdinAiOperationContext>();
