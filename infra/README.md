# Doom WAD Lab — AWS infra

Static hosting for the Vite SPA:

- **S3** (private) + **CloudFront** (HTTPS, SPA routing)
- **ACM** TLS cert for both subdomains
- **Route53** aliases in both hosted zones
- **WAF** (managed rule groups) on CloudFront
- **GitHub Actions OIDC** deploy role (no long-lived AWS keys in GitHub)

Live URLs after apply:

- https://wadlab.computingandtooting.com
- https://wadlab.tootingandcomputing.com

## Why no API Gateway?

This app is a client-side WebGL SPA. CloudFront + S3 is the right fit. API Gateway would only be needed if you add a backend API later.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads) >= 1.5
- AWS CLI configured locally (`aws configure`)
- Route53 hosted zones for both apex domains

## First-time bootstrap

```sh
cd infra
terraform init
terraform plan
terraform apply
```

Copy outputs into GitHub repository variables (Settings → Secrets and variables → Actions → Variables):

| Variable | Source |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw github_deploy_role_arn` |
| `AWS_S3_BUCKET` | `terraform output -raw s3_bucket_name` |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | `terraform output -raw cloudfront_distribution_id` |

Certificate validation and DNS propagation can take several minutes on first apply.

## GitHub deploy flow

On push to `main`, `.github/workflows/deploy.yml`:

1. Runs tests and builds the Vite app
2. Assumes the OIDC IAM role (no stored access keys)
3. Syncs `dist/` to S3
4. Invalidates CloudFront

## Local deploy (optional)

```sh
npm ci
npm test
npm run build
aws s3 sync dist/ "s3://$(terraform -chdir=infra output -raw s3_bucket_name)/" --delete
aws cloudfront create-invalidation \
  --distribution-id "$(terraform -chdir=infra output -raw cloudfront_distribution_id)" \
  --paths "/*"
```
