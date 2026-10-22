#!/usr/bin/env bash
# One-time setup of Bot Lab's compile service on Google Cloud, for the personal account only.
#
#   gcloud auth login <your personal Google account>
#   services/arduino-compiler/setup-gcp.sh <project-id> [region]
#
# Creates (or reuses) the project and, in it: the APIs, an Artifact Registry repo that keeps only recent images,
# the secret the site and the service share, a runtime service account that can read only that secret, a deploy
# service account, and Workload Identity Federation so GitHub Actions deploys from xlibraries/Xlib without keys.
# Then sets the repository variables the arduino-compiler workflow reads. Safe to re-run.
set -euo pipefail

PROJECT="${1:?usage: setup-gcp.sh <project-id> [region]}"
REGION="${2:-us-central1}"          # a Cloud Run free-tier region
REPO_SLUG="xlibraries/Xlib"

if ! [[ "$PROJECT" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
    echo "'$PROJECT' isn't a valid project ID: 6 to 30 characters, lowercase letters, digits and hyphens, starting with" >&2
    echo "a letter and not ending with a hyphen (it's global and permanent), e.g. xlibraries-bot-lab" >&2
    exit 1
fi

ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
case "$ACCOUNT" in
    ""|*@flamapp.com) echo "gcloud is signed in as '${ACCOUNT:-nobody}'. Sign in with your personal account first: gcloud auth login" >&2; exit 1 ;;
esac
GH_USER="$(gh api user --jq .login 2>/dev/null || true)"
if [ "$GH_USER" != "xlibraries" ]; then echo "gh is signed in as '${GH_USER:-nobody}'. Run: gh auth switch --user xlibraries" >&2; exit 1; fi
echo "Google account: $ACCOUNT · project: $PROJECT · region: $REGION · GitHub: $GH_USER"

if ! gcloud projects describe "$PROJECT" >/dev/null 2>&1; then
    gcloud projects create "$PROJECT" --name "xlibraries"
fi
if [ "$(gcloud billing projects describe "$PROJECT" --format 'value(billingEnabled)' 2>/dev/null)" != "True" ]; then
    echo "Cloud Run needs a billing account linked to $PROJECT (usage stays inside the free tier). Link one:" >&2
    echo "  gcloud billing accounts list && gcloud billing projects link $PROJECT --billing-account <ACCOUNT_ID>" >&2
    echo "then run this script again." >&2
    exit 1
fi
gcloud config set project "$PROJECT" >/dev/null
NUMBER="$(gcloud projects describe "$PROJECT" --format 'value(projectNumber)')"

gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
    iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com

# Images: keep the two newest (the free tier stores 0.5 GB)
if ! gcloud artifacts repositories describe bot-lab --location "$REGION" >/dev/null 2>&1; then
    gcloud artifacts repositories create bot-lab --repository-format docker --location "$REGION" --description "Bot Lab services"
fi
POLICY="$(mktemp)"
cat > "$POLICY" <<'JSON'
[{"name": "keep-recent", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 2}},
 {"name": "delete-rest", "action": {"type": "Delete"}, "condition": {"tagState": "any"}}]
JSON
gcloud artifacts repositories set-cleanup-policies bot-lab --location "$REGION" --policy "$POLICY" --no-dry-run >/dev/null

# The shared secret (generated once; the site gets the same value)
if ! gcloud secrets describe bot-lab-compiler-secret >/dev/null 2>&1; then
    openssl rand -hex 32 | tr -d '\n' | gcloud secrets create bot-lab-compiler-secret --replication-policy automatic --data-file=-
fi

RUNTIME="bot-lab-compiler-runtime@$PROJECT.iam.gserviceaccount.com"
DEPLOY="bot-lab-deploy@$PROJECT.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$RUNTIME" >/dev/null 2>&1 || gcloud iam service-accounts create bot-lab-compiler-runtime --display-name "Bot Lab compiler (runtime)"
gcloud iam service-accounts describe "$DEPLOY" >/dev/null 2>&1 || gcloud iam service-accounts create bot-lab-deploy --display-name "Bot Lab compiler (deploy from GitHub)"
gcloud secrets add-iam-policy-binding bot-lab-compiler-secret --member "serviceAccount:$RUNTIME" --role roles/secretmanager.secretAccessor >/dev/null
for role in roles/run.admin roles/artifactregistry.writer; do
    gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$DEPLOY" --role "$role" --condition None >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --member "serviceAccount:$DEPLOY" --role roles/iam.serviceAccountUser >/dev/null

# GitHub → Google without keys: only workflows in xlibraries/Xlib may become the deploy account
gcloud iam workload-identity-pools describe github --location global >/dev/null 2>&1 || \
    gcloud iam workload-identity-pools create github --location global --display-name "GitHub Actions"
gcloud iam workload-identity-pools providers describe github --workload-identity-pool github --location global >/dev/null 2>&1 || \
    gcloud iam workload-identity-pools providers create-oidc github --workload-identity-pool github --location global \
        --issuer-uri https://token.actions.githubusercontent.com \
        --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
        --attribute-condition "assertion.repository == '$REPO_SLUG'"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY" --role roles/iam.workloadIdentityUser \
    --member "principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO_SLUG" >/dev/null

gh variable set GCP_PROJECT_ID --repo "$REPO_SLUG" --body "$PROJECT"
gh variable set GCP_REGION --repo "$REPO_SLUG" --body "$REGION"
gh variable set GCP_DEPLOY_SA --repo "$REPO_SLUG" --body "$DEPLOY"
gh variable set GCP_WIF_PROVIDER --repo "$REPO_SLUG" --body "projects/$NUMBER/locations/global/workloadIdentityPools/github/providers/github"

cat <<DONE

Done. Next:
  1. Deploy:  gh workflow run arduino-compiler --repo $REPO_SLUG   (or merge a change under services/arduino-compiler)
  2. When it's green, give the site the service's address and the secret (Vercel → Settings → Environment Variables):
       BOT_LAB_COMPILER_URL     $(gcloud run services describe bot-lab-compiler --region "$REGION" --format 'value(status.url)' 2>/dev/null || echo '<the URL the deploy prints>')
       BOT_LAB_COMPILER_SECRET  gcloud secrets versions access latest --secret bot-lab-compiler-secret
DONE
