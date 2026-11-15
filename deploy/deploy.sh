#!/usr/bin/env bash
# Pulls the latest main branch and rebuilds/restarts the stack.
# Run by GitHub Actions over SSH (forced command in ~/.ssh/authorized_keys),
# and safe to run by hand:  bash <repo folder>/deploy/deploy.sh
# Works from whatever folder the repo was cloned into.
#
# Everything lives inside main() so bash reads the whole script before running it:
# the git reset below may replace this very file while it runs.

main() {
  set -Eeuo pipefail

  local deploy_dir repo_dir
  deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_dir="$(dirname "$deploy_dir")"
  local compose=(docker compose -f "$deploy_dir/docker-compose.prod.yml" --project-directory "$deploy_dir")

  log() { printf '[deploy %s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

  # One deploy at a time: a second push waits for the first to finish
  exec 9>"/tmp/smartcity-deploy.lock"
  log "Waiting for deploy lock"
  flock 9

  cd "$repo_dir"
  local before after
  before="$(git rev-parse --short HEAD)"
  log "Fetching origin/main"
  git fetch --prune origin main
  # Server copy always matches GitHub. deploy/.env is gitignored, so it is kept.
  git reset --hard origin/main
  after="$(git rev-parse --short HEAD)"
  log "Code: $before -> $after ($(git log -1 --pretty=%s))"

  # Builds the new image first; the running API keeps serving until the build succeeds.
  log "Building and starting containers"
  "${compose[@]}" up -d --build --remove-orphans

  # Wait until the API answers through Caddy (migrations run on container start)
  local domain
  domain="$(grep -E '^API_DOMAIN=' "$deploy_dir/.env" | head -1 | cut -d= -f2- | tr -d "\"' \r")"
  log "Waiting for https://$domain/api/v1"
  if curl -fsS -o /dev/null --max-time 5 --retry 40 --retry-delay 3 --retry-all-errors "https://$domain/api/v1"; then
    log "API is healthy"
  else
    log "API did not become healthy. Last API logs:"
    "${compose[@]}" logs --tail 80 api || true
    exit 1
  fi

  docker image prune -f >/dev/null || true
  log "Deployed $after"
}

main "$@"
exit
