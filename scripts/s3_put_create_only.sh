#!/usr/bin/env bash
# Create-only upload (plan H.8.2 step 2, H.9.1; H.8.5 b): PutObject with If-None-Match: *.
#
#   scripts/s3_put_create_only.sh <bucket> <key> <file> [<cache-control> <content-type>]
#
# The artefacts bucket uses the three-argument form. The game-data publish (scripts/publish_static.py, Phase 13) adds
# the object's Cache-Control and Content-Type, because those files are served from the player site.
#
# S3 stores the file's SHA-256 (and checks the body against it on upload). If the key already exists, S3 answers
# 412 PreconditionFailed; that is accepted only when the stored SHA-256 equals this file's, which is what a re-run of
# the same job, or a rollback re-using an archived build, sees. Anything else fails: a key is never overwritten.
set -euo pipefail

if [[ $# -ne 3 && $# -ne 5 ]]; then
  echo "usage: $0 <bucket> <key> <file> [<cache-control> <content-type>]" >&2
  exit 2
fi
bucket=$1
key=$2
file=$3
[[ -f "$file" ]] || { echo "::error::$file does not exist" >&2; exit 2; }
headers=()
if [[ $# -eq 5 ]]; then
  headers=(--cache-control "$4" --content-type "$5")
fi

local_b64=$(openssl dgst -sha256 -binary "$file" | base64)

if err=$(aws s3api put-object --bucket "$bucket" --key "$key" --body "$file" \
  --if-none-match '*' --checksum-sha256 "$local_b64" "${headers[@]}" 2>&1 >/dev/null); then
  echo "uploaded s3://$bucket/$key"
  exit 0
fi

if [[ "$err" == *PreconditionFailed* ]]; then
  remote_b64=$(aws s3api head-object --bucket "$bucket" --key "$key" --checksum-mode ENABLED \
    --query ChecksumSHA256 --output text)
  if [[ "$remote_b64" == "$local_b64" ]]; then
    echo "already present with identical content: s3://$bucket/$key"
    exit 0
  fi
  echo "::error::s3://$bucket/$key already exists with different content (stored SHA-256 $remote_b64, this file $local_b64). Keys are never overwritten; dispatch a new release." >&2
  exit 1
fi

echo "::error::upload of s3://$bucket/$key failed: $err" >&2
exit 1
