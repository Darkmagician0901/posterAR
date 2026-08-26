# ─────────────────────────────────────────────────────────────────────────────
# Asset bucket — poster bytes, uploaded straight from the browser via a
# presigned PUT and then read back by URL.
# ─────────────────────────────────────────────────────────────────────────────

# Bucket names are globally unique across all AWS accounts, so a fixed name
# would collide with anyone else running this stack.
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "assets" {
  bucket = "${var.name_prefix}-assets-${random_id.bucket_suffix.hex}"
}

resource "aws_s3_bucket_ownership_controls" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    # Disable ACLs entirely; access is granted only by the bucket policy below.
    object_ownership = "BucketOwnerEnforced"
  }
}

# READ ACCESS IS PUBLIC, and that is a deliberate choice worth stating.
#
# The app renders posters by putting their S3 URL straight into a texture
# loader, so objects have to be fetchable without a signature. The same model
# the project already used on Supabase ("public bucket"), so this is not a
# regression — but it does mean anyone with a URL can read an asset. Object
# keys are `<device-uuid>/<uuid>.<ext>`, which is unguessable but not secret.
#
# Only public GET is allowed: no listing, no writes. Uploads still require a
# presigned PUT signed by the API's IAM credentials.
resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "public_read" {
  bucket = aws_s3_bucket.assets.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadObjects"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.assets.arn}/*"
    }]
  })

  # The access block must be relaxed before a public policy is accepted.
  depends_on = [aws_s3_bucket_public_access_block.assets]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Browser uploads are cross-origin: the page is served from the Vite dev
# server, but the PUT goes to s3.amazonaws.com.
resource "aws_s3_bucket_cors_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  cors_rule {
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Testbed uploads are disposable; expiring them keeps the bill and the clutter
# down without anyone having to remember to clean up.
resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    id     = "expire-testbed-assets"
    status = "Enabled"

    filter {}

    expiration {
      days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
