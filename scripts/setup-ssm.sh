#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# setup-ssm.sh — Creates SSM Parameter Store entries for a given stage.
#
# Usage:
#   STAGE=dev ./scripts/setup-ssm.sh
#   STAGE=prod AWS_PROFILE=my-profile ./scripts/setup-ssm.sh
#
# All values are read from environment variables or .env file.
# Secrets are stored as SecureString; plain config as String.
# ---------------------------------------------------------------------------

set -euo pipefail

STAGE="${STAGE:-dev}"
REGION="${AWS_REGION:-us-east-1}"
PREFIX="/ice-breaker/${STAGE}"

# Load .env if present (for local convenience)
if [ -f ".env" ]; then
  echo "Loading .env..."
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

put_secret() {
  local name="$1"
  local value="$2"
  echo "  Putting SecureString: ${PREFIX}/${name}"
  aws ssm put-parameter \
    --region "${REGION}" \
    --name "${PREFIX}/${name}" \
    --value "${value}" \
    --type SecureString \
    --overwrite \
    --no-cli-pager \
    --output text > /dev/null
}

put_string() {
  local name="$1"
  local value="$2"
  echo "  Putting String: ${PREFIX}/${name}"
  aws ssm put-parameter \
    --region "${REGION}" \
    --name "${PREFIX}/${name}" \
    --value "${value}" \
    --type String \
    --overwrite \
    --no-cli-pager \
    --output text > /dev/null
}

echo ""
echo "=== Ice Breaker SSM Setup ==="
echo "Stage  : ${STAGE}"
echo "Region : ${REGION}"
echo "Prefix : ${PREFIX}"
echo ""

# ── Secrets (SecureString) ──
put_secret "OPENAI_API_KEY"           "${OPENAI_API_KEY:?OPENAI_API_KEY is required}"
put_secret "PROXYCURL_API_KEY"        "${PROXYCURL_API_KEY:?PROXYCURL_API_KEY is required}"
put_secret "API_KEY"                  "${API_KEY:?API_KEY is required}"
put_secret "UPSTASH_REDIS_REST_URL"   "${UPSTASH_REDIS_REST_URL:?UPSTASH_REDIS_REST_URL is required}"
put_secret "UPSTASH_REDIS_REST_TOKEN" "${UPSTASH_REDIS_REST_TOKEN:?UPSTASH_REDIS_REST_TOKEN is required}"

# ── Optional secrets ──
if [ -n "${SERPAPI_KEY:-}" ]; then
  put_secret "SERPAPI_KEY" "${SERPAPI_KEY}"
fi

if [ -n "${GOOGLE_API_KEY:-}" ]; then
  put_secret "GOOGLE_API_KEY" "${GOOGLE_API_KEY}"
  put_secret "GOOGLE_CSE_ID"  "${GOOGLE_CSE_ID:?GOOGLE_CSE_ID is required when GOOGLE_API_KEY is set}"
fi

# ── Config (String) ──
put_string "LLM_MODEL"       "${LLM_MODEL:-gpt-4o}"
put_string "SEARCH_PROVIDER" "${SEARCH_PROVIDER:-serpapi}"

echo ""
echo "Done. All parameters stored under ${PREFIX}/"
echo "You can now run: npx sls deploy --stage ${STAGE}"
