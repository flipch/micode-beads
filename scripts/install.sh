#!/bin/sh
# micode-beads installer
# Usage: curl -fsSL https://raw.githubusercontent.com/flipch/micode-beads/main/scripts/install.sh | sh
#
# Installs micode-beads globally via bun or npm. Falls back to downloading
# the tarball from GitHub Releases when no package manager is available.
#
# Environment variables:
#   MICODE_VERSION  - Pin a specific version (default: latest)
#   INSTALL_DIR     - Override install directory for tarball fallback

set -e

REPO="flipch/micode-beads"
GITHUB_API="https://api.github.com"
GITHUB_RELEASES="https://github.com/${REPO}/releases"
DEFAULT_INSTALL_DIR="${HOME}/.local/bin"

# --- Formatting helpers ---

bold=""
reset=""
red=""
green=""
yellow=""
if [ -t 1 ]; then
  bold="\033[1m"
  reset="\033[0m"
  red="\033[31m"
  green="\033[32m"
  yellow="\033[33m"
fi

info() {
  printf "${bold}${green}info${reset} %s\n" "$1"
}

warn() {
  printf "${bold}${yellow}warn${reset} %s\n" "$1"
}

error() {
  printf "${bold}${red}error${reset} %s\n" "$1" >&2
}

# --- Platform detection ---

detect_os() {
  os="$(uname -s)"
  case "$os" in
    Linux)  echo "linux" ;;
    Darwin) echo "darwin" ;;
    *)
      error "Unsupported operating system: ${os}"
      error "micode-beads supports macOS and Linux. On Windows, use WSL."
      exit 1
      ;;
  esac
}

detect_arch() {
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64)  echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    *)
      error "Unsupported architecture: ${arch}"
      error "micode-beads supports x64 and arm64."
      exit 1
      ;;
  esac
}

# --- Dependency checks ---

has_command() {
  command -v "$1" >/dev/null 2>&1
}

require_curl_or_wget() {
  if has_command curl; then
    DOWNLOAD_CMD="curl"
  elif has_command wget; then
    DOWNLOAD_CMD="wget"
  else
    error "Neither curl nor wget found. Please install one and retry."
    exit 1
  fi
}

download() {
  url="$1"
  dest="$2"
  if [ "$DOWNLOAD_CMD" = "curl" ]; then
    curl -fsSL --proto '=https' -o "$dest" "$url"
  else
    wget -q --https-only -O "$dest" "$url"
  fi
}

fetch_url() {
  url="$1"
  if [ "$DOWNLOAD_CMD" = "curl" ]; then
    curl -fsSL --proto '=https' "$url"
  else
    wget -q --https-only -O- "$url"
  fi
}

# --- Version resolution ---

resolve_version() {
  if [ -n "${MICODE_VERSION:-}" ]; then
    echo "$MICODE_VERSION"
    return
  fi
  info "Fetching latest version from GitHub..."
  version="$(fetch_url "${GITHUB_API}/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | sed 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/')"
  if [ -z "$version" ]; then
    error "Failed to determine latest version from GitHub Releases."
    error "Set MICODE_VERSION to install a specific version."
    exit 1
  fi
  echo "$version"
}

# --- Checksum verification ---

verify_checksum() {
  tarball_path="$1"
  checksum_path="$2"

  if [ ! -f "$checksum_path" ]; then
    warn "Checksum file not found. Skipping verification."
    return 0
  fi

  expected="$(cat "$checksum_path" | awk '{print $1}')"
  if [ -z "$expected" ]; then
    warn "Checksum file is empty. Skipping verification."
    return 0
  fi

  if has_command sha256sum; then
    actual="$(sha256sum "$tarball_path" | awk '{print $1}')"
  elif has_command shasum; then
    actual="$(shasum -a 256 "$tarball_path" | awk '{print $1}')"
  else
    warn "Neither sha256sum nor shasum found. Skipping checksum verification."
    return 0
  fi

  if [ "$expected" != "$actual" ]; then
    error "Checksum verification failed."
    error "Expected: ${expected}"
    error "Actual:   ${actual}"
    error "The downloaded file may be corrupted or tampered with."
    rm -f "$tarball_path"
    exit 1
  fi

  info "Checksum verified."
}

# --- Installation methods ---

install_via_bun() {
  version="$1"
  info "Installing micode-beads@${version} via bun..."
  if bun add -g "micode-beads@${version}"; then
    return 0
  else
    warn "bun install failed."
    return 1
  fi
}

install_via_npm() {
  version="$1"
  info "Installing micode-beads@${version} via npm..."
  if npm install -g "micode-beads@${version}"; then
    return 0
  else
    warn "npm install failed."
    return 1
  fi
}

install_via_tarball() {
  version="$1"
  os="$2"
  arch="$3"

  info "No package manager available. Downloading tarball from GitHub Releases..."

  tarball_name="micode-beads-v${version}.tgz"
  checksum_name="micode-beads-v${version}.tgz.sha256"
  tarball_url="${GITHUB_RELEASES}/download/v${version}/${tarball_name}"
  checksum_url="${GITHUB_RELEASES}/download/v${version}/${checksum_name}"

  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  info "Downloading ${tarball_url}..."
  if ! download "$tarball_url" "${tmpdir}/${tarball_name}"; then
    error "Failed to download tarball from GitHub Releases."
    error "URL: ${tarball_url}"
    error "Check that version v${version} exists at ${GITHUB_RELEASES}"
    exit 1
  fi

  info "Downloading checksum..."
  download "$checksum_url" "${tmpdir}/${checksum_name}" 2>/dev/null || true

  verify_checksum "${tmpdir}/${tarball_name}" "${tmpdir}/${checksum_name}"

  install_dir="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
  mkdir -p "$install_dir"

  info "Extracting to ${tmpdir}/package..."
  tar xzf "${tmpdir}/${tarball_name}" -C "$tmpdir"

  if has_command npm; then
    info "Installing extracted package via npm..."
    npm install -g "${tmpdir}/package"
  elif has_command bun; then
    info "Installing extracted package via bun..."
    bun add -g "${tmpdir}/package"
  else
    error "Cannot install the extracted package: neither npm nor bun is available."
    error "Please install Node.js (https://nodejs.org) or Bun (https://bun.sh) and retry."
    exit 1
  fi
}

# --- Post-install verification ---

verify_installation() {
  if has_command micode-beads; then
    installed_version="$(micode-beads --version 2>/dev/null || echo "unknown")"
    info "micode-beads ${installed_version} installed successfully."
    return 0
  fi

  warn "micode-beads command not found on PATH after installation."
  warn "You may need to add the global bin directory to your PATH."

  if has_command npm; then
    npm_bin="$(npm config get prefix)/bin"
    warn "  npm global bin: ${npm_bin}"
  fi
  if has_command bun; then
    bun_bin="${HOME}/.bun/bin"
    warn "  bun global bin: ${bun_bin}"
  fi

  warn "Add the appropriate directory to your PATH and restart your shell."
  return 1
}

# --- Main ---

main() {
  info "micode-beads installer"
  echo ""

  os="$(detect_os)"
  arch="$(detect_arch)"
  info "Platform: ${os}/${arch}"

  require_curl_or_wget

  version="$(resolve_version)"
  info "Version: ${version}"
  echo ""

  installed=false

  if has_command bun; then
    if install_via_bun "$version"; then
      installed=true
    fi
  fi

  if [ "$installed" = false ] && has_command npm; then
    if install_via_npm "$version"; then
      installed=true
    fi
  fi

  if [ "$installed" = false ]; then
    install_via_tarball "$version" "$os" "$arch"
    installed=true
  fi

  echo ""
  verify_installation || true

  echo ""
  info "Next steps:"
  echo "  1. Navigate to your project directory"
  echo "  2. Run: micode-beads init"
  echo "  3. Start using micode-beads with OpenCode"
  echo ""
  info "Documentation: https://github.com/${REPO}#readme"
}

main "$@"
