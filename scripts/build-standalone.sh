#!/bin/sh
# Build standalone micode-beads binaries for all supported platforms.
#
# Uses `bun build --compile` to produce self-contained executables
# that do not require a Bun or Node.js runtime on the target machine.
#
# Outputs:
#   dist/micode-beads-darwin-arm64        (macOS Apple Silicon)
#   dist/micode-beads-darwin-arm64.sha256
#   dist/micode-beads-darwin-x64          (macOS Intel)
#   dist/micode-beads-darwin-x64.sha256
#   dist/micode-beads-linux-arm64         (Linux ARM)
#   dist/micode-beads-linux-arm64.sha256
#   dist/micode-beads-linux-x64           (Linux x86_64)
#   dist/micode-beads-linux-x64.sha256
#
# Usage: sh scripts/build-standalone.sh

set -e

ENTRY="src/cli/index.ts"
DIST="dist"
SIZE_WARN_BYTES=26214400  # 25 MB (warn threshold; bun --compile includes runtime)

TARGETS="bun-darwin-arm64 bun-darwin-x64 bun-linux-arm64 bun-linux-x64"

# --- Helpers ---

info() {
  printf "[build] %s\n" "$1"
}

error() {
  printf "[build] ERROR: %s\n" "$1" >&2
}

target_to_name() {
  target="$1"
  suffix="${target#bun-}"
  echo "micode-beads-${suffix}"
}

generate_checksum() {
  file_path="$1"
  checksum_path="${file_path}.sha256"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file_path" | awk '{print $1}' > "$checksum_path"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file_path" | awk '{print $1}' > "$checksum_path"
  else
    error "Neither sha256sum nor shasum found. Cannot generate checksums."
    exit 1
  fi
}

warn() {
  printf "[build] WARN: %s\n" "$1"
}

check_size() {
  file_path="$1"
  name="$2"
  if [ ! -f "$file_path" ]; then
    error "Binary not found: ${file_path}"
    return 1
  fi
  size="$(wc -c < "$file_path" | tr -d ' ')"
  size_mb="$((size / 1048576))"
  if [ "$size" -gt "$SIZE_WARN_BYTES" ]; then
    warn "${name} is ${size_mb}MB (exceeds 25MB target; expected for bun --compile)"
  else
    info "${name}: ${size_mb}MB (OK)"
  fi
  return 0
}

# --- Main ---

if ! command -v bun >/dev/null 2>&1; then
  error "bun is required but not found on PATH."
  exit 1
fi

mkdir -p "$DIST"

info "Building standalone binaries from ${ENTRY}..."
info "Bun version: $(bun --version)"
echo ""

failed=0

for target in $TARGETS; do
  name="$(target_to_name "$target")"
  outfile="${DIST}/${name}"

  info "Compiling ${name} (target: ${target})..."
  if bun build "$ENTRY" --compile --minify --target="$target" --outfile "$outfile"; then
    generate_checksum "$outfile"
    if ! check_size "$outfile" "$name"; then
      failed=1
    fi
  else
    error "Failed to compile ${name}."
    failed=1
  fi
  echo ""
done

# --- Summary ---

info "Build summary:"
for target in $TARGETS; do
  name="$(target_to_name "$target")"
  outfile="${DIST}/${name}"
  if [ -f "$outfile" ]; then
    checksum="$(cat "${outfile}.sha256" 2>/dev/null || echo "no checksum")"
    size="$(wc -c < "$outfile" | tr -d ' ')"
    size_mb="$((size / 1048576))"
    info "  ${name}: ${size_mb}MB  sha256:${checksum}"
  else
    info "  ${name}: MISSING"
  fi
done

if [ "$failed" -ne 0 ]; then
  error "One or more binaries failed to build or exceeded size limit."
  exit 1
fi

info "All standalone binaries built successfully."
