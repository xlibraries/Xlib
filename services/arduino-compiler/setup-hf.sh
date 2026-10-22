#!/usr/bin/env bash
# One-time setup of Bot Lab's compile service on Hugging Face Spaces, with your personal account only.
#
#   1. On huggingface.co (personal account): Settings → Access Tokens → New token, type "Write"
#   2. gh auth switch --user xlibraries
#   3. services/arduino-compiler/setup-hf.sh [space name, default bot-lab-compiler]   (it asks for the token)
#
# Creates the public Docker Space, gives it a random COMPILER_SECRET, stores the token and the Space's name in the
# GitHub repo (for the arduino-compiler workflow's later deploys), does the first deploy, and prints the two values
# for Vercel. Safe to re-run: an existing Space keeps its secret unless you pass --new-secret.
set -euo pipefail

NAME="${1:-bot-lab-compiler}"
NEW_SECRET="${2:-}"
REPO_SLUG="xlibraries/Xlib"
HERE="$(cd "$(dirname "$0")" && pwd)"
API=https://huggingface.co/api

GH_USER="$(gh api user --jq .login 2>/dev/null || true)"
[ "$GH_USER" = xlibraries ] || { echo "gh is signed in as '${GH_USER:-nobody}'. Run: gh auth switch --user xlibraries" >&2; exit 1; }

if [ -z "${HF_TOKEN:-}" ]; then read -r -s -p "Hugging Face write token: " HF_TOKEN; echo; fi
WHO="$(curl -fsS -H "Authorization: Bearer $HF_TOKEN" "$API/whoami-v2")" || { echo "that token was refused by huggingface.co" >&2; exit 1; }
OWNER="$(echo "$WHO" | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')"
EMAIL="$(echo "$WHO" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("email") or "")')"
case "$EMAIL" in *@flamapp.com) echo "That token belongs to $EMAIL. Use your personal Hugging Face account." >&2; exit 1 ;; esac
SPACE="$OWNER/$NAME"
echo "Hugging Face: $OWNER${EMAIL:+ ($EMAIL)} · Space: $SPACE · GitHub: $GH_USER"

created=0
if ! curl -fsS -o /dev/null -H "Authorization: Bearer $HF_TOKEN" "$API/spaces/$SPACE"; then
    curl -fsS -X POST -H "Authorization: Bearer $HF_TOKEN" -H 'Content-Type: application/json' "$API/repos/create" \
        -d "{\"type\": \"space\", \"name\": \"$NAME\", \"sdk\": \"docker\", \"private\": false}" >/dev/null \
        || { echo "couldn't create the Space (if HF says Docker Spaces need a paid plan, tell Claude: the fallback is Render)" >&2; exit 1; }
    created=1
fi

SECRET=""
if [ "$created" = 1 ] || [ "$NEW_SECRET" = --new-secret ]; then
    SECRET="$(openssl rand -hex 32)"
    curl -fsS -X POST -H "Authorization: Bearer $HF_TOKEN" -H 'Content-Type: application/json' "$API/spaces/$SPACE/secrets" \
        -d "{\"key\": \"COMPILER_SECRET\", \"value\": \"$SECRET\", \"description\": \"Shared with xlibraries.com (BOT_LAB_COMPILER_SECRET)\"}" >/dev/null
fi

gh secret set HF_TOKEN --repo "$REPO_SLUG" --body "$HF_TOKEN"
gh variable set HF_SPACE --repo "$REPO_SLUG" --body "$SPACE"

HF_TOKEN="$HF_TOKEN" HF_SPACE="$SPACE" "$HERE/deploy-hf.sh"

HOST="https://$(echo "$SPACE" | tr '[:upper:]' '[:lower:]' | tr '/_.' '---').hf.space"
echo
echo "Done. Put these in Vercel (Project → Settings → Environment Variables, Production), then redeploy:"
echo "  BOT_LAB_COMPILER_URL     $HOST"
if [ -n "$SECRET" ]; then
    echo "  BOT_LAB_COMPILER_SECRET  $SECRET"
    echo "(Hugging Face won't show the secret again. To replace it later: setup-hf.sh $NAME --new-secret)"
else
    echo "  BOT_LAB_COMPILER_SECRET  (unchanged: the value you saved before, or rerun with --new-secret)"
fi
