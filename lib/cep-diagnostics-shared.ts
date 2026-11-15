export type CepApplyStatus = "applied" | "failed" | "media-missing";

export type CepDiagnosticSummary = {
  reportId: string;
  receivedAt: string;
  occurredAt: string;
  userEmail: string | null;
  verifiedUserId: number | null;
  itemName: string;
  status: CepApplyStatus;
  extensionVersion: string;
  hostVersion: string;
  durationMs: number;
  missingCount: number;
};

export type CepDiagnosticPayload = {
  schemaVersion: number;
  reportId: string;
  installationId: string;
  client: string;
  event: string;
  occurredAt: string;
  durationMs: number;
  item: Record<string, unknown> & { name?: string };
  result: Record<string, unknown> & {
    status: CepApplyStatus;
    relink?: { pending?: unknown[]; unresolved?: unknown[] };
  };
  context: Record<string, unknown> & {
    extension: Record<string, unknown> & { version: string };
    host: Record<string, unknown> & { appVersion: string; appId?: string };
    user?: { email?: string | null; name?: string | null; localUser?: string };
    pack?: { name?: string; version?: string; path?: string } | null;
    settings?: unknown;
  };
  logs: { sequence?: number; time: string; level: string; data: unknown }[];
};

export type CepDiagnosticList = {
  reports: CepDiagnosticSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type CepDiagnosticDetail = CepDiagnosticSummary & { payload: CepDiagnosticPayload };
