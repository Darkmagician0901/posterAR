# Copy to terraform.tfvars and edit.

# Addresses allowed to reach Postgres. Required — there is no default, because
# the database is internet-reachable while the API runs on your laptop.
# Find yours with:  curl -s https://checkip.amazonaws.com
db_allowed_cidrs = ["203.0.113.4/32"]

# Origins allowed to upload straight to S3. During phone testing this is the
# Vite dev server's LAN URL, NOT localhost — the phone is a different host.
cors_allowed_origins = ["https://192.168.1.50:5173"]

# region      = "us-east-1"
# name_prefix = "xr-poster-marker"
