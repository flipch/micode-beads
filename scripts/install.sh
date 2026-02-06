#!/bin/sh
# micode-beads installer
# Usage: curl -fsSL https://raw.githubusercontent.com/flipch/micode-beads/main/scripts/install.sh | sh
#
# Installs micode-beads globally. The installer tries these methods in order:
#   1. Standalone binary from GitHub Releases (no runtime needed)
#   2. bun add -g (if Bun is available)
#   3. npm install -g (if npm is available)
#   4. Bootstrap Bun, then bun add -g (if no JS runtime is present)
#
# Environment variables:
#   MICODE_VERSION  - Pin a specific version (default: latest)
#   INSTALL_DIR     - Override install directory for standalone binary
#   MICODE_NO_UPDATE_CHECK - Set to 1 to skip update checks after install

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
    if ! curl -fsSL --proto '=https' -o "$dest" "$url" 2>/dev/null; then
      check_proxy_hint
      return 1
    fi
  else
    if ! wget -q --https-only -O "$dest" "$url" 2>/dev/null; then
      check_proxy_hint
      return 1
    fi
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

# --- Proxy detection ---

check_proxy_hint() {
  has_proxy=false
  if [ -n "${HTTP_PROXY:-}" ] || [ -n "${HTTPS_PROXY:-}" ] || \
     [ -n "${http_proxy:-}" ] || [ -n "${https_proxy:-}" ]; then
    has_proxy=true
  fi

  if [ "$has_proxy" = true ]; then
    warn "A proxy is configured (HTTP_PROXY/HTTPS_PROXY) but the download failed."
    warn "If your network performs TLS inspection, you may need to set:"
    warn "  export NODE_EXTRA_CA_CERTS=/path/to/corporate-ca.pem"
    warn "  export SSL_CERT_FILE=/path/to/corporate-ca.pem"
  else
    warn "Download failed. If you are behind a corporate proxy, set:"
    warn "  export HTTPS_PROXY=http://your-proxy:port"
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
  file_path="$1"
  checksum_path="$2"

  if [ ! -f "$checksum_path" ]; then
    warn "Checksum file not found. Skipping verification."
    return 0
  fi

  expected="$(awk '{print $1}' "$checksum_path")"
  if [ -z "$expected" ]; then
    warn "Checksum file is empty. Skipping verification."
    return 0
  fi

  if has_command sha256sum; then
    actual="$(sha256sum "$file_path" | awk '{print $1}')"
  elif has_command shasum; then
    actual="$(shasum -a 256 "$file_path" | awk '{print $1}')"
  else
    warn "Neither sha256sum nor shasum found. Skipping checksum verification."
    return 0
  fi

  if [ "$expected" != "$actual" ]; then
    error "Checksum verification failed."
    error "Expected: ${expected}"
    error "Actual:   ${actual}"
    error "The downloaded file may be corrupted or tampered with."
    rm -f "$file_path"
    exit 1
  fi

  info "Checksum verified."
}

# --- Idempotency check ---

check_existing_installation() {
  target_version="$1"
  if has_command micode-beads; then
    current_version_raw="$(micode-beads --version 2>/dev/null || echo "")"
    # Extract version from output like "micode-beads v1.2.0" -> "1.2.0"
    version_field="$(printf '%s\n' "$current_version_raw" | awk '{print $NF}')"
    current_version="$(printf '%s\n' "$version_field" | sed 's/^v//')"
    if [ -n "$current_version" ] && [ "$current_version" = "$target_version" ]; then
      info "micode-beads ${target_version} is already installed and up to date."
      return 0
    fi
    if [ -n "$current_version" ]; then
      info "micode-beads ${current_version} is installed. Upgrading to ${target_version}..."
    fi
    return 1
  fi
  return 1
}

# --- Installation methods ---

install_standalone() {
  version="$1"
  os="$2"
  arch="$3"

  binary_name="micode-beads-${os}-${arch}"
  checksum_name="${binary_name}.sha256"
  binary_url="${GITHUB_RELEASES}/download/v${version}/${binary_name}"
  checksum_url="${GITHUB_RELEASES}/download/v${version}/${checksum_name}"

  install_dir="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"

  tmpdir="$(mktemp -d)"

  info "Downloading standalone binary: ${binary_name}..."
  if ! download "$binary_url" "${tmpdir}/${binary_name}"; then
    warn "Standalone binary not available for v${version} on ${os}/${arch}."
    warn "Falling back to package manager installation..."
    rm -rf "$tmpdir"
    return 1
  fi

  info "Downloading checksum..."
  download "$checksum_url" "${tmpdir}/${checksum_name}" 2>/dev/null || true

  verify_checksum "${tmpdir}/${binary_name}" "${tmpdir}/${checksum_name}"

  mkdir -p "$install_dir"
  cp "${tmpdir}/${binary_name}" "${install_dir}/micode-beads"
  chmod +x "${install_dir}/micode-beads"
  rm -rf "$tmpdir"

  info "Installed standalone binary to ${install_dir}/micode-beads"

  # Ensure install directory is on PATH
  case ":${PATH}:" in
    *":${install_dir}:"*)
      ;;
    *)
      warn "${install_dir} is not in your PATH."
      warn "Add it to your shell profile:"
      warn "  export PATH=\"${install_dir}:\$PATH\""
      ;;
  esac

  return 0
}

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

bootstrap_bun() {
  info "No JavaScript runtime found. Bootstrapping Bun..."

  if [ "$DOWNLOAD_CMD" = "curl" ]; then
    if ! curl -fsSL https://bun.sh/install | sh; then
      error "Failed to install Bun."
      check_proxy_hint
      return 1
    fi
  else
    if ! wget -qO- https://bun.sh/install | sh; then
      error "Failed to install Bun."
      check_proxy_hint
      return 1
    fi
  fi

  # Make bun available in this session
  bun_install_dir="${BUN_INSTALL:-${HOME}/.bun}"
  if [ -f "${bun_install_dir}/bin/bun" ]; then
    PATH="${bun_install_dir}/bin:${PATH}"
    export PATH
  fi

  if has_command bun; then
    info "Bun installed successfully."
    return 0
  else
    warn "Bun installation completed but 'bun' command not found on PATH."
    warn "You may need to restart your shell or add ~/.bun/bin to your PATH."
    return 1
  fi
}

install_via_tarball() {
  version="$1"

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

    info "Running post-install diagnostics..."
    if micode-beads doctor 2>/dev/null; then
      info "All diagnostics passed."
    else
      warn "Some diagnostics reported issues."
      warn "Run 'micode-beads doctor --fix' to attempt automatic repairs."
    fi

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

  install_dir="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
  warn "  standalone install dir: ${install_dir}"
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

  # Idempotency: skip installation if already at target version
  if check_existing_installation "$version"; then
    echo ""
    verify_installation || true
    echo ""
    info "Documentation: https://github.com/${REPO}#readme"
    return 0
  fi

  installed=false

  # Priority 1: Standalone binary (no runtime needed)
  if install_standalone "$version" "$os" "$arch"; then
    installed=true
  fi

  # Priority 2: bun add -g
  if [ "$installed" = false ] && has_command bun; then
    if install_via_bun "$version"; then
      installed=true
    fi
  fi

  # Priority 3: npm install -g (only when Bun is also available, since CLI requires Bun runtime)
  if [ "$installed" = false ] && has_command npm && has_command bun; then
    if install_via_npm "$version"; then
      installed=true
    fi
  fi

  # Priority 4: Bootstrap Bun, then bun add -g
  if [ "$installed" = false ]; then
    if bootstrap_bun; then
      if install_via_bun "$version"; then
        installed=true
      fi
    fi
  fi

  # Last resort: tarball
  if [ "$installed" = false ]; then
    install_via_tarball "$version"
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
