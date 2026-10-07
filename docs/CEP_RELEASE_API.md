# CEP release publication API

`https://motionflow.pro/api/cep/releases` publishes locally signed Spunkram, Gal and Odin ZXP files from any Windows/Mac checkout of `motionflow-omni`. The CLI no longer needs the backend checkout or its `.env`. Local signing remains required; no ZXP build is added to GitHub Actions.

## Configuration

The existing `MOTIONFLOW_ADMIN_API_SECRET` authenticates publication. Optionally set a separate `CEP_RELEASE_TOKEN` on the server and restart the app; both credentials are accepted using `Authorization: Bearer ...`. Panel user tokens, session cookies and tester email allowlists do not authorize publication.

Each build machine sets `MOTIONFLOW_RELEASE_TOKEN` to one of those server secrets, or stores `{"token":"..."}` in the ignored `.motionflow-release.local.json` at the CEP repository root. Never commit the token or send it to R2. Git access and the signing certificate must also be available on that machine.

Uses existing R2 access credentials, public bucket/CDN and Redis configuration. Upload staging goes to `R2_BUCKET` (the private bucket), falling back to `R2_PUBLIC_BUCKET` if unset. The R2 credential must support upload/read/delete in the staging bucket and read/copy/write in the public bucket. Configure a lifecycle rule to expire abandoned `cep-release-uploads/` objects after one day in the staging bucket. Successful uploads are deleted after publication.

Deploy this backend before updating the CEP CLI. In this installation, push triggers the normal deployment. No new dependency or database migration is required. Preflight rejects unavailable authentication/storage before the CLI bumps versions or changes Git.

## Protocol

All responses are JSON with `Cache-Control: no-store`.

`GET` returns `{protocol:1,products:["spunkram","gal","odin"],maxBytes:536870912}` after authentication and configuration/Redis checks.

`POST` prepare body:

```json
{"action":"prepare","product":"spunkram","version":"1.2.3","channel":"stable","size":12345,"sha256":"64 lowercase hex characters","changelog":"Release notes"}
```

Returns `{uploadId,uploadUrl,headers,expiresIn:3600}`. The URL is a presigned PUT for one temporary object. The CLI streams exactly `size` bytes with `Content-Type: application/octet-stream` and `Content-Length`, without its release token. There is a 512 MiB file limit. Versions must be `x.y.z` (stable) or `x.y.z-beta.N` (beta); channel and version must agree.

`POST {"action":"publish","uploadId":"..."}` verifies the upload owner's credential, size and streamed SHA-256. A per-brand/channel Redis lock prevents competing publications. Copy uses the verified object's ETag so replacement of a staging object between validation and copying is rejected. Existing versioned archives cannot be replaced by different bytes, and channel pointers cannot downgrade. The public pointer changes only after the verified archive exists. Existing legacy archive paths, FFmpeg URLs and updater manifests are preserved.

Returns `{manifest,alreadyPublished,notified}`. Confirmation retries use the same one-hour receipt and return the existing publication without repeating storage writes or WS events. A pointer-write failure can be retried against the already copied archive. `notified:false` is a warning: the durable release succeeded but its WebSocket event failed. Ordinary update checks still return the new manifest. `notified:null` accompanies an already completed receipt.

Error statuses: `400` invalid metadata, `401` invalid credential, `403` another credential's receipt, `409` concurrent publication/newer version/existing different archive, `410` expired receipt, `413` oversized control request, `422` size/hash mismatch, `503` configuration or infrastructure failure. The server gives publication up to three minutes, releasing its lock afterward. Failed uploads keep existing pointers intact; a transport error after a completed write can be resolved by retrying confirmation.

## Verification

```sh
node --test scripts/test-cep-releases.mjs scripts/test-cep-release-api.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Tests execute real handlers and publication functions with R2/Redis mocks: all authors/channels, authentication, validation, corruption, conflicts, version isolation, confirmation replay and recovery from a pointer failure. They do not publish production releases.
