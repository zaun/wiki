#!/usr/bin/env bash
set -e

# Usage: ./build.sh <command>
# Commands: build-images | push-images | create-manifests | push-dev | help

# extract IMAGE and VERSION from Dockerfile LABELs
IMG=$(sed -n 's/^LABEL image-name="\([^"]*\)".*/\1/p' Dockerfile)
VER=$(sed -n 's/^LABEL version="\([^"]*\)".*/\1/p'   Dockerfile)
REG=registry.jgz.guru

function build_images() {
  echo "→ Building amd64 image…"
  podman build --no-cache --platform linux/amd64   -t "${IMG}:${VER}-amd64" .
  echo "→ Building arm64 image…"
  podman build --no-cache --platform linux/arm64/v8 -t "${IMG}:${VER}-arm64" .
}

function push_images() {
  echo "→ Tagging images…"
  podman tag "${IMG}:${VER}-amd64" "${REG}/${IMG}:${VER}-amd64"
  podman tag "${IMG}:${VER}-arm64" "${REG}/${IMG}:${VER}-arm64"
  echo "→ Pushing amd64…"
  podman push "${REG}/${IMG}:${VER}-amd64"
  echo "→ Pushing arm64…"
  podman push "${REG}/${IMG}:${VER}-arm64"
  echo "→ Pulling back manifests…"
  podman pull "${REG}/${IMG}:${VER}-amd64"
  podman pull "${REG}/${IMG}:${VER}-arm64"
}

function create_manifests() {
  echo "→ Recreating versioned manifest ${VER}…"
  podman manifest rm "${REG}/${IMG}:${VER}" 2>/dev/null || true
  podman manifest create "${REG}/${IMG}:${VER}" \
    "${IMG}:${VER}-amd64" "${IMG}:${VER}-arm64"
  podman manifest push --all "${REG}/${IMG}:${VER}"

  echo "→ Recreating latest manifest…"
  podman manifest rm "${REG}/${IMG}:latest" 2>/dev/null || true
  podman manifest create "${REG}/${IMG}:latest" \
    "${IMG}:${VER}-amd64" "${IMG}:${VER}-arm64"
  podman manifest push --all "${REG}/${IMG}:latest"
}

function push_dev() {
  build_images
  push_images
  create_manifests
}

function show_help() {
  cat << EOF

Usage: ./build.sh <command>

Commands:
  build-images       Build amd64 & arm64 container images (no cache)
  push-images        Tag & push those images, then pull them back
  create-manifests   Create & push both versioned and latest multi-arch manifests
  push-dev           Full cycle: build-images, push-images, create-manifests
  help               Show this message

LABELs read from Dockerfile:
  image-name → $IMG
  version    → $VER

EOF
}

# dispatch
case "$1" in
  build-images)       build_images     ;;
  push-images)        push_images      ;;
  create-manifests)   create_manifests ;;
  push-dev)           push_dev         ;;
  help|*)             show_help        ;;
esac
