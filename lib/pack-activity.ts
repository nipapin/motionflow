import "server-only";
import type { PoolConnection } from "mysql2/promise";
import { recordUserActivity } from "@/lib/user-activity";
import type { ActivityDetails } from "@/lib/user-activity-shared";

export type ActivityPack = { id: number; name: string | null; version: string | null };
type PackChange = { pack: ActivityPack; action: string; details: ActivityDetails };

/** A report is evidence of state, not proof of an installation time or an effect applied in a project. */
export function diffPackActivity(previous: ActivityPack[], next: ActivityPack[], mode: "installs" | "active"): PackChange[] {
  const before = new Map(previous.map((pack) => [pack.id, pack]));
  const after = new Map(next.map((pack) => [pack.id, pack]));
  const changes: PackChange[] = [];
  for (const pack of after.values()) {
    const old = before.get(pack.id);
    if (!old) changes.push({ pack, action: mode === "installs" ? "pack_installed" : "pack_activated", details: { version: pack.version } });
    else if (mode === "installs" && old.version !== pack.version) changes.push({
      pack, action: "pack_updated", details: { version: pack.version, previousVersion: old.version },
    });
  }
  for (const pack of before.values()) {
    if (!after.has(pack.id)) changes.push({ pack, action: mode === "installs" ? "pack_removed" : "pack_deactivated", details: { version: pack.version } });
  }
  return changes;
}

export async function recordPackActivity(
  connection: PoolConnection, input: { userId: number; deviceId: number; previous: ActivityPack[]; next: ActivityPack[]; mode: "installs" | "active" },
): Promise<void> {
  for (const change of diffPackActivity(input.previous, input.next, input.mode)) {
    await recordUserActivity({
      userId: input.userId, deviceId: input.deviceId, category: "extension", action: change.action,
      resourceType: "extension_pack", resourceId: change.pack.id, resourceName: change.pack.name,
      source: "extension", status: "observed", details: change.details,
    }, connection);
  }
}
