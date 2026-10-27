import "server-only";

/** Client identity must come from verified server-side authentication. */
export function getReplicateApiToken(user: {
  source?: string;
  cepClient?: string;
}): string | undefined {
  const token = user.cepClient === "spunkram-cep"
    ? process.env.REPLICATE_SPUNKRAM_API_TOKEN
    : process.env.REPLICATE_API_TOKEN;
  // Never fall back to the shared account when Spunkram is not configured.
  return token?.trim() || undefined;
}
