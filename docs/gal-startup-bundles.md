# GAL first-install archives

After uploading GAL dependencies and the host manifest, run from next-app:

```sh
npm run gal:prepare-startup
# Or one host:
npm run gal:prepare-startup -- --host=PR
```

The command loads the existing R2 environment, fetches dependencies six at a
time, compresses them once at gzip level 9, and replaces the single latest TAR.GZ
in the private GAL bucket. An already current bundle is reused. It never changes
the source files or manifest. Temporary local files are removed after publication.

The key is `{hostPrefix}/Startup/latest.tar.gz`; its fingerprint metadata hashes
`JSON.stringify([manifestEtag, sortedCanonicalPaths])`. ETag matches the assets
manifest API: quoted first 32 hex characters of SHA-256 over its exact UTF-8 text.
Members are `files/0`, `files/1`, ... in sorted canonical path order. Only startup
dependencies (`Assets/_Assets/`) and fonts are included; project and SFX sources
remain on demand. Complete preparation before distributing the new library.

New CEP versions send `direct: true` when requesting an archive. For a full
installation, the server returns a one-hour presigned R2 URL, exact byte size,
ordered paths, `archive_etag`, and `shared: true`. The client downloads directly from storage
without its session headers, maps numbered members using the returned order,
and leaves the shared archive available for other users. Authentication and
manifest path validation happen before issuing the link. The request uses
`If-Match` with the archive's ETag, so replacement during startup cannot install
the wrong revision. No account-specific
data is included in a bundle.

Existing clients, partial updates, or manifests with no prepared bundle retain
the temporary archive API. Those archives use gzip level 1 to reduce preparation
latency. Updates compare each installed file's hash with the current manifest;
they work from any older version and never require permanent per-version diffs.
Client installation completion no longer waits for the server's DELETE cleanup
request. A changed manifest invalidates the fingerprint of the latest bundle;
the preparation command replaces it without retaining previous full archives.

Deployment requires the server changes and an updated GAL CEP build. Preparing
the R2 bundles alone does not activate direct downloads in existing builds.
