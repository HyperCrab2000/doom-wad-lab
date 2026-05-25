variable "project_name" {
  type        = string
  description = "Short project slug used in resource names."
  default     = "doom-wad-lab"
}

variable "aws_region" {
  type        = string
  description = "Primary AWS region for S3 and IAM."
  default     = "us-east-1"
}

variable "site_subdomain" {
  type        = string
  description = "Hostname label before each apex domain."
  default     = "wadlab"
}

variable "domains" {
  type = object({
    computingandtooting_zone_id = string
    tootingandcomputing_zone_id = string
  })
  description = "Route53 hosted zone IDs for both apex domains."
}

variable "github_org" {
  type        = string
  description = "GitHub organization or user that owns the repository."
  default     = "HyperCrab2000"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository name used for OIDC trust."
  default     = "doom-wad-lab"
}

variable "enable_waf" {
  type        = bool
  description = "Attach AWS WAF to the CloudFront distribution."
  default     = true
}

variable "price_class" {
  type        = string
  description = "CloudFront price class."
  default     = "PriceClass_100"
}

locals {
  fqdns = [
    "${var.site_subdomain}.computingandtooting.com",
    "${var.site_subdomain}.tootingandcomputing.com",
  ]

  site_bucket_name = "${var.project_name}-site-${data.aws_caller_identity.current.account_id}"
}

data "aws_caller_identity" "current" {}
