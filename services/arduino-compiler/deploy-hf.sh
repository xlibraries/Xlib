#!/usr/bin/env bash
# Pushes the compile service to its Hugging Face Space (a Docker Space builds and runs the Dockerfile), then waits
# until the Space is running and answers. Used by the arduino-compiler workflow and by setup-hf.sh's first deploy.
#
#   HF_TOKEN=<write token> HF_SPACE=<owner>/<name> services/arduino-compiler/deploy-hf.sh
set -euo pipefail
: "${HF_TOKEN:?HF_TOKEN (a Hugging Face write token)}" "${HF_SPACE:?HF_SPACE (owner/name)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REV="$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || echo local)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Only what the image needs, plus the Space's card (its front matter tells HF to build the Dockerfile on port 8080)
cp "$HERE/Dockerfile" "$HERE/compile.sh" "$HERE/entrypoint.sh" "$HERE/server.py" "$WORK/"
cat > "$WORK/README.md" <<CARD
---
title: Bot Lab compiler
emoji: 🔧
colorFrom: green
colorTo: blue
sdk: docker
app_port: 8080
pinned: false
short_description: Compiles Arduino sketches for xlibraries.com's Bot Lab
---

The Arduino compile service behind [Bot Lab](https://xlibraries.com). Deployed from
[xlibraries/Xlib](https://github.com/xlibraries/Xlib/tree/master/services/arduino-compiler) at \`$REV\`; edit it there,
not here. \`POST /compile\` needs the shared secret.
CARD

cd "$WORK"
git init -q -b main
git -c user.name=xlibraries -c user.email=64978693+xlibraries@users.noreply.github.com add -A
git -c user.name=xlibraries -c user.email=64978693+xlibraries@users.noreply.github.com commit -q -m "Deploy xlibraries/Xlib@$REV"
git push -q --force "https://user:${HF_TOKEN}@huggingface.co/spaces/${HF_SPACE}" main
echo "pushed $REV to $HF_SPACE; waiting for the Space to build and start…"

HOST="https://$(echo "${HF_SPACE}" | tr '[:upper:]' '[:lower:]' | tr '/_.' '---').hf.space"
for _ in $(seq 1 90); do       # up to 15 minutes (the first build installs the toolchain)
    stage="$(curl -fsS -H "Authorization: Bearer $HF_TOKEN" "https://huggingface.co/api/spaces/${HF_SPACE}/runtime" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("stage",""))' || true)"
    case "$stage" in
        RUNNING) break ;;
        BUILD_ERROR|RUNTIME_ERROR|CONFIG_ERROR) echo "the Space failed: $stage (see its logs on huggingface.co)" >&2; exit 1 ;;
    esac
    sleep 10
done
[ "$stage" = RUNNING ] || { echo "the Space didn't start in 15 minutes (stage: ${stage:-unknown})" >&2; exit 1; }
curl -fsS "$HOST/healthz" >/dev/null
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$HOST/compile" -d '{}')"
[ "$code" = 401 ] || { echo "expected 401 without the secret, got $code" >&2; exit 1; }
echo "running at $HOST"
