#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${DEPLOY_HOST:?}" "${DEPLOY_SSH_KEY:?}" "${DEPLOY_KNOWN_HOSTS:?}"
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9.-]+$ ]]
key="$RUNNER_TEMP/motionflow-key-$$"
known="$RUNNER_TEMP/motionflow-known-$$"
printf '%s\n' "$DEPLOY_SSH_KEY" > "$key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$known"
trap 'rm -f "$key" "$known"' EXIT
opts=(-i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$known" -o ConnectTimeout=15)
if [[ "${1:-}" == notify ]]; then
  payload=$(node --input-type=module -e 'console.log(Buffer.from(JSON.stringify({status:process.env.NOTIFY_STATUS,sha:process.env.RELEASE_COMMIT||process.env.GITHUB_SHA,detail:process.env.NOTIFY_DETAIL||"",url:`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}/attempts/${process.env.GITHUB_RUN_ATTEMPT}`})).toString("base64"))')
  ssh "${opts[@]}" "root@$DEPLOY_HOST" "cd /webhook-reciever && node --env-file=.env /root/motionflow-ci/notify-server.mjs '$payload'"
elif [[ "${1:-}" == deploy ]]; then
  [[ "$RELEASE_ID" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]]
  incoming="/root/motionflow-deploy/incoming/$RELEASE_ID"
  ssh "${opts[@]}" "root@$DEPLOY_HOST" "mkdir -p '$incoming'"
  scp "${opts[@]}" release-artifacts/* "root@$DEPLOY_HOST:$incoming/"
  ssh "${opts[@]}" "root@$DEPLOY_HOST" "bash '$incoming/install-release.sh' '$RELEASE_ID'"
else
  echo 'Expected notify or deploy' >&2; exit 1
fi
