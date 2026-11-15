# Legacy Gal Toolkit MAX apply diagnostics

The CEP panel imports the preset project, copies the requested sequence to the
timeline, records the pasted clips' media node IDs, and only then relinks offline
media. Nested sequences are included. Relinking does not consult
`canChangeMediaPath()`: every existing candidate file is passed to
`changeMediaPath(path, true)`. The post-paste pass is limited to the pasted media;
unrelated offline footage in the user's project is not touched.

After each Premiere element apply, including failed applications, the panel queues
a JSON report and posts it to `https://motionflow.pro/api/cep/diagnostics`.
Sending happens in the background and does not delay the apply result.

## Captured data

- Element ID, name, category, arguments, source project path and apply mode.
- Outcome, processing stage, duration, target/preset sequence IDs and relink results.
- A bounded console buffer, window errors, unhandled rejections and JSX replies.
- Extension and Premiere versions, extension location, OS, architecture and locale.
- Client-reported email/name and local OS username.
- Active package path/version and relevant extension preferences.

Passwords, bearer tokens, legacy USIDs, purchase codes and similar authentication
fields are redacted in the client and again on the server. The sender never places
legacy login credentials in the request. The installation ID is a random UUID,
not a hardware fingerprint.

## Transport and storage

`POST /api/cep/diagnostics` accepts at most 512 KiB of JSON with schema version 1.
Its CORS response supports CEP's file origin. The legacy sender does not have a
Next/CEP bearer token, so submitted identity is explicitly client-reported, not
authenticated. If a valid CEP bearer is supplied, the server additionally stores
the verified account ID. Public ingestion is limited to 90 reports per minute per
IP and worker; report IDs deduplicate retries.

Pending reports live in `diagnostics-outbox` under the panel's shared preferences
directory. Up to 25 reports are retained locally; successful uploads are removed.
Network failures, 404/503 during deployment, and rate limiting keep the report for
the next apply or browser online event. Invalid/oversize submissions (400/413)
are discarded so one malformed report cannot block the queue.

The MySQL table `cep_apply_reports` is created lazily on first use; the equivalent
DDL is in `db/migrations/2026_11_15_cep_apply_reports.sql` for deployments where
application credentials cannot create tables. Reports remain stored until an
operator removes them; this change does not schedule automatic deletion.

## Viewing reports

`/profile/cep-diagnostics` and its `/api/admin/cep-diagnostics` list/detail routes
use the same administrator allowlist as AI Usage. Reports cannot be read through
the public ingestion endpoint. The page supports email/element/version/report-ID
search, status and received-date filters, pagination, console/context/settings/
result views and JSON download. All diagnostic text is rendered as text, not HTML.

Deploy Next before distributing a panel build that sends these reports. Until the
endpoint is available, reports remain in the local outbox. No Telegram or other
third-party notification is emitted by this pipeline.
