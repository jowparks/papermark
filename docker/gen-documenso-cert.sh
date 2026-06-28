#!/bin/sh
# gen-documenso-cert.sh — generate a self-signed PKCS#12 signing certificate for
# the bundled Documenso service into the `documenso-certs` volume. Idempotent:
# no-op if the cert already exists.
#
# Documenso REQUIRES a signing certificate to seal PDFs. Self-signed is fine for
# self-host: it produces a valid cryptographic signature (the PDF is signed and
# tamper-evident); it is simply not chained to a public CA / Adobe Trust List.
# The passphrase is operator-supplied via DOCUMENSO_CERT_PASSPHRASE (.env) so
# Documenso can open the same .p12 at runtime.
set -eu

CERT="/certs/documenso-cert.p12"

if [ -f "$CERT" ]; then
  echo "gen-documenso-cert: $CERT already exists, leaving it untouched."
  exit 0
fi

: "${DOCUMENSO_CERT_PASSPHRASE:?DOCUMENSO_CERT_PASSPHRASE must be set}"

mkdir -p /certs
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "gen-documenso-cert: generating self-signed certificate..."
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" \
  -subj "/CN=Documenso Self-Host (Papermark)"

# Many PDF-signing readers only parse the legacy PKCS#12 algorithms (RC2/3DES).
# OpenSSL 3.x defaults to AES-256; pass -legacy there for max compatibility, and
# fall back to the modern format if the legacy provider is unavailable.
LEGACY=""
case "$(openssl version 2>/dev/null)" in
  "OpenSSL 3."*) LEGACY="-legacy" ;;
esac

if [ -n "$LEGACY" ] && ! openssl pkcs12 -export -legacy \
  -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
  -out "$CERT" -passout pass:"$DOCUMENSO_CERT_PASSPHRASE" 2>/dev/null; then
  echo "gen-documenso-cert: -legacy unavailable, using modern PKCS#12."
  LEGACY=""
fi

if [ -z "$LEGACY" ]; then
  openssl pkcs12 -export \
    -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
    -out "$CERT" -passout pass:"$DOCUMENSO_CERT_PASSPHRASE"
fi

# World-readable so the non-root Documenso container can read it via the :ro mount.
chmod 444 "$CERT"

echo "gen-documenso-cert: wrote $CERT"
