resource "aws_route53_record" "site_computing" {
  zone_id = var.domains.computingandtooting_zone_id
  name    = local.fqdns[0]
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "site_computing_aaaa" {
  zone_id = var.domains.computingandtooting_zone_id
  name    = local.fqdns[0]
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "site_tooting" {
  zone_id = var.domains.tootingandcomputing_zone_id
  name    = local.fqdns[1]
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "site_tooting_aaaa" {
  zone_id = var.domains.tootingandcomputing_zone_id
  name    = local.fqdns[1]
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}
