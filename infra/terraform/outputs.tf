# Every value the server's .env needs, so provisioning ends with a copy-paste
# rather than a hunt through the console. Run:
#
#   terraform output -raw server_env > ../../server/.env
#
# Individual outputs are also exposed for scripting.

output "s3_bucket" {
  description = "Asset bucket name."
  value       = aws_s3_bucket.assets.bucket
}

output "s3_endpoint" {
  description = "Regional S3 endpoint the SDK signs against."
  value       = "https://s3.${var.region}.amazonaws.com"
}

output "s3_public_base_url" {
  description = "Base URL objects are served from (public GET)."
  value       = "https://${aws_s3_bucket.assets.bucket}.s3.${var.region}.amazonaws.com"
}

output "db_endpoint" {
  description = "RDS host:port."
  value       = aws_db_instance.main.endpoint
}

output "database_url" {
  description = "Postgres connection string for the API."
  value = format(
    "postgres://%s:%s@%s/%s",
    aws_db_instance.main.username,
    urlencode(random_password.db.result),
    aws_db_instance.main.endpoint,
    aws_db_instance.main.db_name,
  )
  sensitive = true
}

output "access_key_id" {
  description = "IAM access key for the API."
  value       = aws_iam_access_key.api.id
  sensitive   = true
}

output "secret_access_key" {
  description = "IAM secret key for the API."
  value       = aws_iam_access_key.api.secret
  sensitive   = true
}

output "server_env" {
  description = "Complete server/.env contents."
  sensitive   = true
  value       = <<-EOT
    DATABASE_URL=postgres://${aws_db_instance.main.username}:${urlencode(random_password.db.result)}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}
    S3_ENDPOINT=https://s3.${var.region}.amazonaws.com
    S3_REGION=${var.region}
    S3_ACCESS_KEY_ID=${aws_iam_access_key.api.id}
    S3_SECRET_ACCESS_KEY=${aws_iam_access_key.api.secret}
    S3_BUCKET=${aws_s3_bucket.assets.bucket}
    S3_PUBLIC_BASE_URL=https://${aws_s3_bucket.assets.bucket}.s3.${var.region}.amazonaws.com
    S3_FORCE_PATH_STYLE=false
    PORT=8787
  EOT
}
