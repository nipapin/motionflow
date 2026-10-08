#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
id=${1:?release ID required}
[[ "$id" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || exit 1
root=/root/motionflow-deploy
legacy=/var/www/motionflow_p_usr/data/www/next.motionflow.pro
incoming="$root/incoming/$id"
release="$root/releases/$id"
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]]
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 20 ]] || { echo 'Node 20 required' >&2; exit 1; }
for tool in pm2 flock curl tar sha256sum; do command -v "$tool" >/dev/null; done
[[ -f "$legacy/.env" && -f "$legacy/ecosystem.config.cjs" ]]
mkdir -p "$root/releases" "$root/shared"
exec 9>"$root/deploy.lock"
flock -n 9 || { echo 'Deployment already running' >&2; exit 1; }
cd "$incoming"
sha256sum -c motionflow.tgz.sha256
previous=""
config="$legacy/ecosystem.config.cjs"
if [[ -L "$root/current" ]]; then
  previous=$(readlink -f "$root/current")
  [[ "$previous" == "$root/releases/"* && -f "$previous/ecosystem.release.cjs" ]]
  config="$previous/ecosystem.release.cjs"
fi
[[ ! -e "$release" ]] || { echo 'Release exists; rerun all jobs with a new attempt' >&2; exit 1; }
stage=$(mktemp -d "$root/releases/.staging-$id-XXXXXX")
switched=0
start_app() {
  if pm2 describe motionflow >/dev/null 2>&1; then pm2 delete motionflow; fi
  pm2 start "$1" --only motionflow
}
rollback() {
  trap - ERR INT TERM
  if [[ "$switched" == 1 ]]; then
    if [[ -n "$previous" ]]; then
      ln -s "$previous" "$root/.rollback-$id"
      mv -Tf "$root/.rollback-$id" "$root/current"
    else
      rm -f "$root/current"
    fi
    start_app "$config" || true
    pm2 save || true
  fi
  echo 'Deployment failed; previous application restored if activation had started.' >&2
  exit 1
}
trap rollback ERR INT TERM
tar -xzf motionflow.tgz -C "$stage" --no-same-owner --no-same-permissions
cd "$stage"
node scripts/verify-ci-release.mjs "$id"
ln -s "$legacy/.env" .env
if [[ ! -e "$root/shared/cache" ]]; then
  if [[ -d "$legacy/.cache" ]]; then cp -a "$legacy/.cache" "$root/shared/cache";
  else mkdir "$root/shared/cache"; fi
fi
ln -s "$root/shared/cache" .cache
mv "$stage" "$release"
ln -s "$release" "$root/.current-$id"
mv -Tf "$root/.current-$id" "$root/current"
switched=1
start_app "$release/ecosystem.release.cjs"
healthy=0
for attempt in $(seq 1 25); do
  if curl --fail --silent --max-time 10 http://127.0.0.1:3000/api/deploy-health | node "$release/scripts/check-ci-health.mjs" "$id"; then
    healthy=1; break
  fi
  sleep 2
done
[[ "$healthy" == 1 ]] || { echo 'Readiness failed' >&2; false; }
pm2 save
if [[ -n "$previous" ]]; then
  ln -s "$previous" "$root/.previous-$id"
  mv -Tf "$root/.previous-$id" "$root/previous"
fi
trap - ERR INT TERM
node "$release/scripts/prune-ci-releases.mjs" "$root" || echo 'Release cleanup failed; inspect disk space' >&2
echo "Activated $id; no build or npm install ran on VPS."
