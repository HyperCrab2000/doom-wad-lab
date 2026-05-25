#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA="$ROOT/infra"

echo "==> Checking tools"
command -v aws >/dev/null || { echo "aws CLI required"; exit 1; }
command -v terraform >/dev/null || {
  echo "Terraform not found. Install with: brew install terraform"
  exit 1
}

echo "==> AWS identity"
aws sts get-caller-identity

if [[ ! -f "$INFRA/terraform.tfvars" ]]; then
  echo "Copy infra/terraform.tfvars.example to infra/terraform.tfvars and fill in hosted zone IDs."
  exit 1
fi

echo "==> Applying infrastructure"
terraform -chdir="$INFRA" init
terraform -chdir="$INFRA" apply

ROLE_ARN="$(terraform -chdir="$INFRA" output -raw github_deploy_role_arn)"
BUCKET="$(terraform -chdir="$INFRA" output -raw s3_bucket_name)"
DIST_ID="$(terraform -chdir="$INFRA" output -raw cloudfront_distribution_id)"

cat <<EOF

Infrastructure applied.

Site URLs:
$(terraform -chdir="$INFRA" output -json site_urls | python3 -c 'import json,sys; [print(" ", u) for u in json.load(sys.stdin)]')

Set GitHub Actions variables (requires: gh auth login):

  gh variable set AWS_DEPLOY_ROLE_ARN --body "$ROLE_ARN"
  gh variable set AWS_S3_BUCKET --body "$BUCKET"
  gh variable set AWS_CLOUDFRONT_DISTRIBUTION_ID --body "$DIST_ID"

Create the production environment (optional but recommended):

  gh api repos/:owner/:repo/environments/production -X PUT

Then push main to trigger deploy:

  git push origin main

EOF
