resource "aws_acm_certificate" "site" {
  provider = aws.us_east_1

  domain_name               = local.fqdns[0]
  subject_alternative_names = [local.fqdns[1]]
  validation_method         = "DNS"
}

resource "aws_route53_record" "cert_validation_computing" {
  zone_id = var.domains.computingandtooting_zone_id
  name    = one([for dvo in aws_acm_certificate.site.domain_validation_options : dvo.resource_record_name if dvo.domain_name == local.fqdns[0]])
  type    = one([for dvo in aws_acm_certificate.site.domain_validation_options : dvo.resource_record_type if dvo.domain_name == local.fqdns[0]])
  records = [one([for dvo in aws_acm_certificate.site.domain_validation_options : dvo.resource_record_value if dvo.domain_name == local.fqdns[0]])]
  ttl     = 60
}

resource "aws_route53_record" "cert_validation_tooting" {
  zone_id = var.domains.tootingandcomputing_zone_id
  name    = one([for dvo in aws_acm_certificate.site.domain_validation_options : dvo.resource_record_name if dvo.domain_name == local.fqdns[1]])
  type    = one([for dvo in aws_acm_certificate.site.domain_validation_options : dvo.resource_record_type if dvo.domain_name == local.fqdns[1]])
  records = [one([for dvo in aws_acm_certificate.site.domain_validation_options : dvo.resource_record_value if dvo.domain_name == local.fqdns[1]])]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "site" {
  provider = aws.us_east_1

  certificate_arn = aws_acm_certificate.site.arn
  validation_record_fqdns = [
    aws_route53_record.cert_validation_computing.fqdn,
    aws_route53_record.cert_validation_tooting.fqdn,
  ]
}
