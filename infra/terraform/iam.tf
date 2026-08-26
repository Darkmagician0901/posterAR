# ─────────────────────────────────────────────────────────────────────────────
# API credentials for S3.
#
# An IAM USER with long-lived access keys, not a role. Roles are the better
# answer and are what this becomes when the API moves to ECS (a task role, no
# keys at all) — but a role cannot be assumed by a process running on someone's
# laptop without extra federation machinery, which is exactly the throwaway
# scaffolding this phase is meant to avoid. The permissions are scoped tightly
# enough that the keys are worth little on their own.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_iam_user" "api" {
  name = "${var.name_prefix}-api"
}

resource "aws_iam_access_key" "api" {
  user = aws_iam_user.api.name
}

resource "aws_iam_user_policy" "api_s3" {
  name = "${var.name_prefix}-api-s3"
  user = aws_iam_user.api.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Object-level access, confined to this one bucket. No bucket
        # creation, no policy edits, no reach into any other bucket.
        Sid    = "ObjectAccess"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.assets.arn}/*"
      },
      {
        # Needed so the SDK can resolve the bucket's region when presigning.
        Sid      = "BucketMetadata"
        Effect   = "Allow"
        Action   = ["s3:GetBucketLocation", "s3:ListBucket"]
        Resource = aws_s3_bucket.assets.arn
      },
    ]
  })
}
