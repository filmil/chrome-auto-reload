#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# One-time Google Cloud setup for .github/workflows/webstore.yml: a service
# account for the Chrome Web Store API, and a Workload Identity Federation
# provider that lets this repository's GitHub Actions, and nothing else,
# act as it. No key is created. Running it again changes nothing.
#
# usage: scripts/webstore-setup.sh PROJECT_ID [REPOSITORY]
#   REPOSITORY defaults to filmil/chrome-auto-reload.
# Needs gcloud, logged in as an owner of the project.
set -euo pipefail
project="${1:?usage: webstore-setup.sh PROJECT_ID [REPOSITORY]}"
repo="${2:-filmil/chrome-auto-reload}"
sa_name="chrome-web-store"
sa="$sa_name@$project.iam.gserviceaccount.com"
pool="github"
provider="chrome-auto-reload"

g() { gcloud --project "$project" --quiet "$@"; }

g services enable chromewebstore.googleapis.com iamcredentials.googleapis.com \
  sts.googleapis.com iam.googleapis.com
number="$(g projects describe "$project" --format='value(projectNumber)')"

# Each step makes the thing if it is missing, and brings back one that was
# deleted in the last 30 days, which gcloud still describes.
state() { g "$@" --format='value(state)' 2>/dev/null || echo MISSING; }

if ! g iam service-accounts describe "$sa" >/dev/null 2>&1; then
  g iam service-accounts create "$sa_name" --display-name="Chrome Web Store publisher"
fi

case "$(state iam workload-identity-pools describe "$pool" --location=global)" in
  MISSING) g iam workload-identity-pools create "$pool" --location=global \
             --display-name="GitHub Actions" ;;
  DELETED) g iam workload-identity-pools undelete "$pool" --location=global ;;
esac

provider_args=(--location=global --workload-identity-pool="$pool")
case "$(state iam workload-identity-pools providers describe "$provider" "${provider_args[@]}")" in
  MISSING) g iam workload-identity-pools providers create-oidc "$provider" "${provider_args[@]}" \
             --issuer-uri="https://token.actions.githubusercontent.com" \
             --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
             --attribute-condition="assertion.repository == '$repo'" ;;
  DELETED) g iam workload-identity-pools providers undelete "$provider" "${provider_args[@]}" ;;
esac
# Only this repository may log in, also when the provider was made for
# another one before.
g iam workload-identity-pools providers update-oidc "$provider" "${provider_args[@]}" \
  --attribute-condition="assertion.repository == '$repo'" >/dev/null

g iam service-accounts add-iam-policy-binding "$sa" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$number/locations/global/workloadIdentityPools/$pool/attribute.repository/$repo" \
  >/dev/null

cat <<DONE

Done. Next:
1. In the Chrome Web Store Developer Dashboard, under Account, add the
   service account: $sa
2. Set the repository variables (they are not secret):
   gh variable set -R $repo GCP_WORKLOAD_IDENTITY_PROVIDER --body projects/$number/locations/global/workloadIdentityPools/$pool/providers/$provider
   gh variable set -R $repo CWS_SERVICE_ACCOUNT --body $sa
   gh variable set -R $repo CWS_PUBLISHER_ID --body <from Dashboard, Publisher, Settings>
   gh variable set -R $repo CWS_EXTENSION_ID --body <the item's ID in the Dashboard>
DONE
