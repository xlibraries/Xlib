#!/usr/bin/env bash
# One-time setup of Bot Lab's builds on GitHub Actions (run it yourself, so the secret only shows in your terminal).
#
#   gh auth switch --user xlibraries
#   services/arduino-compiler/setup-actions.sh [site URL, default https://xlibraries.com]
#
# Generates the job secret the site and the bot-lab-compile workflow share, stores it (and the site's address) in the
# repo, makes sure the compiler image is published, and tells you the two values to put in Vercel. Re-running makes
# a new secret (update Vercel too).
set -euo pipefail
SITE="${1:-https://xlibraries.com}"
REPO_SLUG="xlibraries/Xlib"

GH_USER="$(gh api user --jq .login 2>/dev/null || true)"
[ "$GH_USER" = xlibraries ] || { echo "gh is signed in as '${GH_USER:-nobody}'. Run: gh auth switch --user xlibraries" >&2; exit 1; }

SECRET="$(openssl rand -hex 32)"
gh secret set BOT_LAB_JOB_SECRET --repo "$REPO_SLUG" --body "$SECRET"
gh variable set BOT_LAB_SITE --repo "$REPO_SLUG" --body "$SITE"
echo "✓ BOT_LAB_JOB_SECRET and BOT_LAB_SITE ($SITE) stored in $REPO_SLUG"

if gh api "/users/xlibraries/packages/container/arduino-compiler" >/dev/null 2>&1; then
    echo "✓ the compiler image is published"
else
    gh workflow run arduino-compiler --repo "$REPO_SLUG" && echo "… publishing the compiler image (about 5 minutes): gh run watch --repo $REPO_SLUG"
fi

cat <<DONE

Two more steps, in the browser:

1. A GitHub token that can only start workflows:
   https://github.com/settings/personal-access-tokens/new  (signed in as xlibraries)
     Resource owner: xlibraries · Repository access: Only select repositories → Xlib
     Permissions → Repository → Actions: Read and write   (nothing else)
     Expiration: the longest offered (put a reminder in your calendar to renew it)

2. Vercel → the xlib project → Settings → Environment Variables (Production), then redeploy:
     BOT_LAB_GITHUB_TOKEN   the token from step 1
     BOT_LAB_JOB_SECRET     $SECRET
DONE
