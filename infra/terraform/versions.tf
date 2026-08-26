terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State is intentionally LOCAL. This stack is a single-operator testbed, and
  # an S3/DynamoDB backend would itself need bootstrapping infrastructure that
  # outlives the experiment. Revisit before more than one person applies it.
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "xr-poster"
      Component = "marker-testbed"
      ManagedBy = "terraform"
    }
  }
}
