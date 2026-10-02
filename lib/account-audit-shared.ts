/** Client-safe account history types. Passwords and tokens are never included. */
export type AccountChange =
  | { before: string | number | boolean | null; after: string | number | boolean | null }
  | { changed: true };

export type AccountAuditEntry = {
  id: string;
  userId: number;
  actorUserId: number | null;
  actorName: string | null;
  source: string;
  action: "created" | "updated" | "deleted";
  changes: Record<string, AccountChange>;
  createdAt: string;
};

export type AccountAuditPage = {
  entries: AccountAuditEntry[];
  nextCursor: string | null;
};
