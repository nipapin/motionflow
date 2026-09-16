/**
 * Match a CEP login request to an already-occupied device seat.
 * Keep this aligned with CEP `src/js/lib/utils/device-session.ts` (MAC hex).
 */

export type CepDeviceFingerprint = {
  mac?: string;
  user?: string;
  os?: string;
};

export type OccupiedCepDevice = {
  name?: string | null;
  user_fingerprint?: string | null;
};

/** 6-byte MAC as 12 hex chars. Hashed fingerprints (32+ hex) are not MACs. */
export function realMacHex(raw?: string | null): string | null {
  const hex = (raw || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
  return hex.length === 12 ? hex : null;
}

export function normalizedOsUser(raw?: string | null): string | null {
  const user = raw?.trim().toLowerCase();
  if (!user || user === "unknown") return null;
  return user;
}

export function parseDeviceFingerprint(
  json: string | null | undefined,
): CepDeviceFingerprint | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as unknown;
    if (value && typeof value === "object") return value as CepDeviceFingerprint;
  } catch {
    /* ignore */
  }
  return null;
}

function occupiedOsUser(device: OccupiedCepDevice): string | null {
  const fingerprint = parseDeviceFingerprint(device.user_fingerprint);
  return normalizedOsUser(device.name) || normalizedOsUser(fingerprint?.user);
}

/**
 * Find the occupied seat this panel should reuse.
 * MAC match first (same machine as CEP auto-replace). At the device limit,
 * also match the OS username so a returning User B does not look like User D.
 */
export function findReusableOccupiedDevice<T extends OccupiedCepDevice>(
  incoming: CepDeviceFingerprint | null,
  occupied: T[],
  opts?: { matchOsUser?: boolean },
): T | undefined {
  if (!incoming) return undefined;

  const incomingMac = realMacHex(incoming.mac);
  if (incomingMac) {
    const byMac = occupied.find(
      (device) =>
        realMacHex(parseDeviceFingerprint(device.user_fingerprint)?.mac) ===
        incomingMac,
    );
    if (byMac) return byMac;
  }

  if (!opts?.matchOsUser) return undefined;

  const incomingUser = normalizedOsUser(incoming.user);
  if (!incomingUser) return undefined;
  return occupied.find((device) => occupiedOsUser(device) === incomingUser);
}
