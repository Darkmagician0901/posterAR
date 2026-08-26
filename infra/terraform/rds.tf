# ─────────────────────────────────────────────────────────────────────────────
# Postgres — asset metadata (existing `assets` table) and the marker-relative
# placements that make a scene recoverable after a cold start.
#
# Deployed into the account's DEFAULT VPC rather than a purpose-built network.
# A dedicated VPC with private subnets and a bastion is the right answer once
# the API runs in ECS; while the API runs on a laptop, it would only add moving
# parts without changing who can reach the database — that is decided by the
# security group below.
# ─────────────────────────────────────────────────────────────────────────────

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.name_prefix}-db-subnets"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_security_group" "db" {
  name        = "${var.name_prefix}-db"
  description = "Postgres access for the marker testbed API"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "Postgres from the operator's allowlisted addresses"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.db_allowed_cidrs
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Generated rather than supplied, so a password never has to be typed into a
# tfvars file or a shell history. Read it back with:
#   terraform output -raw database_url
resource "random_password" "db" {
  length = 32
  # RDS rejects '/', '@', '"' and space in a master password; excluding the
  # wider punctuation set also keeps the value safe to paste into a URL.
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_db_instance" "main" {
  identifier     = "${var.name_prefix}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "xrposter"
  username = "xrposter"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]

  # Reachable from outside the VPC because the API runs on the operator's
  # machine in this phase. The security group — not this flag — is what keeps
  # it private, which is why db_allowed_cidrs has no default.
  publicly_accessible = true

  # Testbed posture: no long retention, and destroy without ceremony.
  backup_retention_period = 1
  skip_final_snapshot     = true
  deletion_protection     = false
  apply_immediately       = true

  # Minor version upgrades are welcome; major ones should be a deliberate act.
  auto_minor_version_upgrade = true
}
