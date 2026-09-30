#!/bin/sh
set -eu

certificate_directory=/etc/nginx/certs
certificate_file="$certificate_directory/fullchain.pem"
private_key_file="$certificate_directory/privkey.pem"

mkdir -p "$certificate_directory"

if [ ! -s "$certificate_file" ] || [ ! -s "$private_key_file" ]; then
  echo "Creating a temporary TLS certificate while Let's Encrypt is initialized"
  openssl req -x509 -nodes -newkey rsa:2048 -days 2 \
    -keyout "$private_key_file" \
    -out "$certificate_file" \
    -subj "/CN=${CLIENT_DOMAIN:-localhost}" \
    -addext "subjectAltName=DNS:${CLIENT_DOMAIN:-localhost},DNS:${API_DOMAIN:-localhost}"
  chmod 600 "$private_key_file"
fi

(
  previous_checksum="$(sha256sum "$certificate_file" "$private_key_file")"
  while sleep 60; do
    current_checksum="$(sha256sum "$certificate_file" "$private_key_file" 2>/dev/null || true)"
    if [ -n "$current_checksum" ] && [ "$current_checksum" != "$previous_checksum" ]; then
      previous_checksum="$current_checksum"
      nginx -s reload || true
    fi
  done
) &
