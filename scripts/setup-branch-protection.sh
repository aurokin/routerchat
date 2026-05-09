#!/usr/bin/env bash
# Apply branch protection to main on the GitHub repo.
# Lightweight: no force-push, no deletion, linear history, conversation
# resolution required. No required PR reviews (solo project) and no
# required status checks yet — add those once CI run names stabilize.
set -euo pipefail

REPO="${REPO:-aurokin/routerchat}"
BRANCH="${BRANCH:-main}"

PAYLOAD=$(cat <<'JSON'
{
    "required_status_checks": null,
    "enforce_admins": false,
    "required_pull_request_reviews": null,
    "restrictions": null,
    "allow_force_pushes": false,
    "allow_deletions": false,
    "required_linear_history": true,
    "required_conversation_resolution": true
}
JSON
)

echo "$PAYLOAD" | gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" --input -
echo "Branch protection applied to $REPO@$BRANCH"
