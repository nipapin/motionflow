import "server-only";
import { SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";

/**
 * CEP client → marketplace author registry.
 * Author IDs never leave the server; panels only send `client`.
 * @see CEP/spunkram-library/docs/BACKEND_CEP_API.md §0
 */
export type CepClientConfig = {
  client: string;
  authorId: number;
  extensionName: string;
  /** Browser confirmation page title */
  loginTitle: string;
  loginDescription: string;
  /** Free / no Spunkram subscription — AI generations per month. */
  freeGenerationsLimit: number;
  /** Editor (library packs) subscription — AI generations per month. */
  editorGenerationsLimit: number;
  /** Editor AI subscription — AI generations per month. */
  editorAiGenerationsLimit: number;
  /** @deprecated use editorAiGenerationsLimit */
  subscribedGenerationsLimit: number;
  freePackSlots: number;
  pricingPath: string;
  manageSubscriptionPath: string;
};

const REGISTRY: Record<string, CepClientConfig> = {
  "spunkram-cep": {
    client: "spunkram-cep",
    authorId: SPUNKRAM_AUTHOR_ID,
    extensionName: "Spunkram",
    loginTitle: "Sign in to the Spunkram extension",
    loginDescription:
      "The Spunkram extension in Premiere Pro / After Effects is asking to use your account.",
    freeGenerationsLimit: 5,
    editorGenerationsLimit: 10,
    editorAiGenerationsLimit: 100,
    subscribedGenerationsLimit: 100,
    freePackSlots: 1,
    pricingPath: "/pricing?client=spunkram-cep",
    manageSubscriptionPath: "/profile/subscriptions?client=spunkram-cep",
  },
};

export const DEFAULT_CEP_CLIENT = "spunkram-cep";

export function normalizeCepClient(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_CEP_CLIENT;
  const t = raw.trim().slice(0, 64);
  return t || DEFAULT_CEP_CLIENT;
}

export function getCepClientConfig(client: string): CepClientConfig | null {
  return REGISTRY[client] ?? null;
}

export function requireCepClientConfig(client: string): CepClientConfig {
  const cfg = getCepClientConfig(client);
  if (!cfg) {
    throw new CepUnknownClientError(client);
  }
  return cfg;
}

export class CepUnknownClientError extends Error {
  readonly code = "UNKNOWN_CLIENT" as const;
  constructor(public readonly client: string) {
    super(`Unknown CEP client: ${client}`);
    this.name = "CepUnknownClientError";
  }
}
