output "site_urls" {
  description = "Public site URLs."
  value       = [for fqdn in local.fqdns : "https://${fqdn}"]
}

output "s3_bucket_name" {
  description = "S3 bucket that stores built static assets."
  value       = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for cache invalidation."
  value       = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "github_deploy_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC deployment."
  value       = aws_iam_role.github_deploy.arn
}

output "waf_web_acl_arn" {
  description = "WAF Web ACL ARN attached to CloudFront."
  value       = var.enable_waf ? aws_wafv2_web_acl.site[0].arn : null
}
