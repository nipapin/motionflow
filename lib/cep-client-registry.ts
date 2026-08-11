import "server-only";
import { SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";

/**
 * Marketplace catalog author used by Motion Flow main-site categories
 * (DaVinci / AE / PR / audio) — see `lib/market-items.ts`.
 */
export const MOTIONFLOW_MARKETPLACE_AUTHOR_ID = 6;

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
  /**
   * Path on motionflow.pro opened for Allow/Deny
   * (e.g. `/spunkram` or `/cep/login`).
   */
  verificationPath: string;
  /**
   * When true, `/api/cep/me` reports Motion Flow Creator / Creator+AI
   * (platform subscription), not an author pack subscription.
   */
  platformSubscription: boolean;
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
    verificationPath: "/spunkram",
    platformSubscription: false,
    freeGenerationsLimit: 5,
    editorGenerationsLimit: 10,
    editorAiGenerationsLimit: 100,
    subscribedGenerationsLimit: 100,
    freePackSlots: 1,
    pricingPath: "/pricing?client=spunkram-cep",
    manageSubscriptionPath: "/profile/subscriptions?client=spunkram-cep",
  },
  "motionflow-davinci": {
    client: "motionflow-davinci",
    authorId: MOTIONFLOW_MARKETPLACE_AUTHOR_ID,
    extensionName: "Motion Flow",
    loginTitle: "Sign in to the Motion Flow DaVinci script",
    loginDescription:
      "The Motion Flow script in DaVinci Resolve is asking to use your account.",
    verificationPath: "/cep/login",
    platformSubscription: true,
    // Platform Creator+AI uses /api/me/generations (100/mo); these limits
    // are only used for CEP author-tier helpers when platformSubscription is false.
    freeGenerationsLimit: 0,
    editorGenerationsLimit: 0,
    editorAiGenerationsLimit: 100,
    subscribedGenerationsLimit: 100,
    freePackSlots: 0,
    pricingPath: "/pricing?client=motionflow-davinci",
    manageSubscriptionPath: "/profile/subscriptions?client=motionflow-davinci",
  },
};

export const DEFAULT_CEP_CLIENT = "spunkram-cep";

export const MOTIONFLOW_DAVINCI_CLIENT = "motionflow-davinci";

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
