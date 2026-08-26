variable "region" {
  description = "AWS region for the bucket and database."
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix for every resource name, so the stack is easy to find and destroy."
  type        = string
  default     = "xr-poster-marker"
}

variable "db_allowed_cidrs" {
  description = <<-EOT
    CIDR blocks allowed to reach Postgres on 5432.

    Deliberately has NO default. In this phase the API runs on the operator's
    laptop and talks to RDS over the internet, so the database must be
    reachable — but defaulting that to 0.0.0.0/0 would quietly publish it.
    Set this to your own address, e.g. ["203.0.113.4/32"], and update it when
    your IP changes.
  EOT
  type        = list(string)

  validation {
    condition     = !contains(var.db_allowed_cidrs, "0.0.0.0/0")
    error_message = "Refusing to open Postgres to the whole internet. List specific CIDRs."
  }
}

variable "db_instance_class" {
  description = "RDS instance size. The smallest Graviton class is ample for a testbed."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS storage in GB."
  type        = number
  default     = 20
}

variable "cors_allowed_origins" {
  description = <<-EOT
    Origins allowed to issue presigned PUT uploads straight to S3.

    Must include the dev server origin the phone actually loads, which is an
    https://<lan-ip>:5173 URL rather than localhost — the phone is a different
    host. A browser upload from an origin missing here fails CORS preflight,
    which surfaces confusingly as a generic network error.
  EOT
  type        = list(string)

  # No default, and "*" refused. A wildcard here lets any site on the internet
  # issue presigned PUTs against the bucket. Requiring the value means an
  # apply that forgot it fails loudly rather than failing open.
  validation {
    condition     = !contains(var.cors_allowed_origins, "*")
    error_message = "cors_allowed_origins must list real origins; \"*\" is not allowed."
  }
}
