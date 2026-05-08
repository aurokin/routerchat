#!/usr/bin/env bash
set -euo pipefail

# Set GitHub Actions repo secrets for Convex deploy workflows.
#
# Secrets created/updated:
# - CONVEX_DEPLOY_KEY_PREVIEW
# - CONVEX_DEPLOY_KEY_PROD
#
# Notes:
# - Uses `gh secret set` reading values from stdin (so secrets don't appear in argv).
# - Requires `gh auth login` already done.

REPO=""
PREVIEW_KEY_FILE=""
PROD_KEY_FILE=""
FROM_ENV="0"
DRY_RUN="0"

usage() {
  cat <<'EOF'
Usage:
  scripts/ci/set-gh-secrets-convex.sh [--repo OWNER/REPO] [--from-env] [--dry-run]
  scripts/ci/set-gh-secrets-convex.sh [--repo OWNER/REPO] --preview-key-file path --prod-key-file path

Options:
  --repo OWNER/REPO        Target repo (defaults to current repo via gh).
  --from-env               Read values from env vars:
                           CONVEX_DEPLOY_KEY_PREVIEW, CONVEX_DEPLOY_KEY_PROD
  --dry-run                Read inputs, but don't store secrets.
  --preview-key-file PATH  Read preview deploy key from file.
  --prod-key-file PATH     Read prod deploy key from file.

Interactive mode:
  If no key sources are provided, you'll be prompted (input hidden).

Examples:
  scripts/ci/set-gh-secrets-convex.sh --repo OWNER/REPO
  CONVEX_DEPLOY_KEY_PREVIEW='...' CONVEX_DEPLOY_KEY_PROD='...' scripts/ci/set-gh-secrets-convex.sh --from-env
  scripts/ci/set-gh-secrets-convex.sh --preview-key-file .private/keys/convex_preview.txt --prod-key-file .private/keys/convex_prod.txt
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2;;
    --from-env) FROM_ENV="1"; shift 1;;
    --dry-run) DRY_RUN="1"; shift 1;;
    --preview-key-file) PREVIEW_KEY_FILE="$2"; shift 2;;
    --prod-key-file) PROD_KEY_FILE="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1;;
  esac
done

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

if [[ -z "$REPO" ]]; then
  # Derive the repo from the current directory's git remote.
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
fi

if [[ -z "$REPO" ]]; then
  echo "Could not determine repo. Pass --repo OWNER/REPO" >&2
  exit 1
fi

read_secret_from_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Secret file not found: $path" >&2
    exit 1
  fi
  # Strip trailing newline; preserve everything else.
  python3 -c 'import sys
p=sys.argv[1]
with open(p, "rb") as f:
  b=f.read()
while b.endswith(b"\n") or b.endswith(b"\r"):
  b=b[:-1]
sys.stdout.buffer.write(b)
' "$path"
}

prompt_secret() {
  local label="$1"
  local out_var="$2"
  local val

  # Read from the controlling terminal so this works even if stdin is piped.
  # Use stty to hide input while still supporting paste reliably.
  if [[ -r /dev/tty ]]; then
    local stty_state
    stty_state="$(stty -g < /dev/tty)"
    printf '%s (paste then Enter; input hidden): ' "$label" > /dev/tty
    stty -echo < /dev/tty
    IFS= read -r val < /dev/tty || true
    stty "$stty_state" < /dev/tty
    printf '\n' > /dev/tty
  else
    echo "No /dev/tty available for secure input." >&2
    echo "Use --from-env or --preview-key-file/--prod-key-file." >&2
    exit 1
  fi

  # Some clipboards/terminals include a trailing carriage return.
  val="${val%$'\r'}"

  if [[ -z "$val" ]]; then
    echo "Empty value provided for $label" >&2
    exit 1
  fi
  printf -v "$out_var" "%s" "$val"

  # Confirm capture without printing the secret.
  echo "Captured ${#val} characters for $label" >&2
}

PREVIEW_VAL=""
PROD_VAL=""

if [[ "$FROM_ENV" == "1" ]]; then
  PREVIEW_VAL="${CONVEX_DEPLOY_KEY_PREVIEW:-}"
  PROD_VAL="${CONVEX_DEPLOY_KEY_PROD:-}"
elif [[ -n "$PREVIEW_KEY_FILE" || -n "$PROD_KEY_FILE" ]]; then
  if [[ -z "$PREVIEW_KEY_FILE" || -z "$PROD_KEY_FILE" ]]; then
    echo "When using file mode, both --preview-key-file and --prod-key-file are required." >&2
    exit 1
  fi
  PREVIEW_VAL="$(read_secret_from_file "$PREVIEW_KEY_FILE")"
  PROD_VAL="$(read_secret_from_file "$PROD_KEY_FILE")"
else
  if [[ ! -t 0 && ! -r /dev/tty ]]; then
    echo "No TTY available for interactive prompts." >&2
    echo "Use --from-env or --preview-key-file/--prod-key-file." >&2
    exit 1
  fi
  prompt_secret "CONVEX_DEPLOY_KEY_PREVIEW" PREVIEW_VAL
  prompt_secret "CONVEX_DEPLOY_KEY_PROD" PROD_VAL
fi

if [[ -z "$PREVIEW_VAL" || -z "$PROD_VAL" ]]; then
  echo "Missing one or more secret values." >&2
  exit 1
fi

echo "Setting secrets on repo: $REPO" >&2

if [[ "$DRY_RUN" == "1" ]]; then
  echo "Dry run: secrets not stored." >&2
  exit 0
fi

# Use stdin to avoid exposing values in process arguments.
printf '%s\n' "$PREVIEW_VAL" | gh secret set CONVEX_DEPLOY_KEY_PREVIEW -a actions -R "$REPO"
printf '%s\n' "$PROD_VAL" | gh secret set CONVEX_DEPLOY_KEY_PROD -a actions -R "$REPO"

echo "Done." >&2
