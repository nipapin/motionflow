#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${DEPLOY_HOST:?}" "${DEPLOY_SSH_KEY:?}" "${DEPLOY_KNOWN_HOSTS:?}"
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9.-]+$ ]]
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ ]]
case "$ACCOUNTING_OPERATION" in inspect|backup|prepare|verify|enable|status|disable) ;; *) exit 1;; esac
for sha in "${ACCOUNTING_NEXT_COMMIT:-}" "${ACCOUNTING_LARAVEL_COMMIT:-}"; do
  [[ -z "$sha" || "$sha" =~ ^[a-f0-9]{40}$ ]] || exit 1
done
key="$RUNNER_TEMP/accounting-key-$$"
known="$RUNNER_TEMP/accounting-known-$$"
printf '%s\n' "$DEPLOY_SSH_KEY" > "$key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$known"
trap 'rm -f "$key" "$known"' EXIT
opts=(-i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$known" -o ConnectTimeout=15)
remote="/root/motionflow-accounting-ops/$GITHUB_SHA"
ssh "${opts[@]}" "root@$DEPLOY_HOST" "install -d -m 700 '$remote'"
scp "${opts[@]}" scripts/paddle-accounting-ops.mjs "root@$DEPLOY_HOST:$remote/"
ssh "${opts[@]}" "root@$DEPLOY_HOST" "node '$remote/paddle-accounting-ops.mjs' '$ACCOUNTING_OPERATION' '${ACCOUNTING_NEXT_COMMIT:-}' '${ACCOUNTING_LARAVEL_COMMIT:-}'"
