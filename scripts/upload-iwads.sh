#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA="$ROOT/infra"
WAD_DIR="$ROOT/public/wads"

command -v aws >/dev/null || { echo "aws CLI required"; exit 1; }

if [[ ! -f "$INFRA/terraform.tfstate" ]] && [[ ! -d "$INFRA/.terraform" ]]; then
  echo "Run scripts/bootstrap-aws.sh first."
  exit 1
fi

BUCKET="$(terraform -chdir="$INFRA" output -raw s3_bucket_name)"
DIST_ID="$(terraform -chdir="$INFRA" output -raw cloudfront_distribution_id)"

upload_wad() {
  local file="$1"
  local name
  name="$(basename "$file")"
  echo "==> Uploading $name"
  aws s3 cp "$file" "s3://$BUCKET/wads/$name" \
    --content-type "application/octet-stream" \
    --cache-control "public,max-age=31536000,immutable"
}

found=0
for pattern in DOOM.WAD DOOM2.WAD doom.wad doom2.wad; do
  if [[ -f "$WAD_DIR/$pattern" ]]; then
    upload_wad "$WAD_DIR/$pattern"
    found=1
  fi
done

if [[ "$found" -eq 0 ]]; then
  echo "No IWAD files found in $WAD_DIR"
  echo "Place DOOM.WAD and/or DOOM2.WAD there, then re-run this script."
  exit 1
fi

echo "==> Invalidating CloudFront cache for /wads/*"
aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/wads/*"

cat <<EOF

IWAD upload complete.

These files are not deployed from GitHub Actions (commercial game data).
Re-run this script whenever you replace local IWAD copies.

EOF
