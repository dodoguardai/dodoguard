#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

IMAGE_REPO="${IMAGE_REPO:-zhian}"
LEGACY_TAG="${LEGACY_TAG:-zhian:1.0.0}"
NODE_IMAGE="${NODE_IMAGE:-node:22.14.0-alpine}"
ALPINE_REPOSITORY="${ALPINE_REPOSITORY:-https://mirrors.aliyun.com/alpine/v3.21}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
PIP_INDEX_URL="${PIP_INDEX_URL:-https://pypi.tuna.tsinghua.edu.cn/simple}"
INSTALL_SCAN_CLIS="${INSTALL_SCAN_CLIS:-1}"
OFFLINE_DIR="${OFFLINE_DIR:-zhian-offline}"
GZIP_LEVEL="${GZIP_LEVEL:-9}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
    return
  fi
  shasum -a 256 "$1"
}

sanitize_tag_part() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_.-]+/-/g; s/^-+//; s/-+$//'
}

require_cmd docker
require_cmd git
require_cmd sed

GIT_SHA="$(git rev-parse --short=12 HEAD)"
GIT_FULL_SHA="$(git rev-parse HEAD)"
GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BUILD_STAMP="$(date +%Y%m%d-%H%M%S)"

if [ -n "$(git status --porcelain)" ]; then
  DIRTY="true"
  DIRTY_SUFFIX="-dirty"
else
  DIRTY="false"
  DIRTY_SUFFIX=""
fi

VERSION="${VERSION:-${BUILD_STAMP}-${GIT_SHA}${DIRTY_SUFFIX}}"
VERSION="$(sanitize_tag_part "${VERSION}")"
IMAGE_TAG="${IMAGE_REPO}:${VERSION}"
IMAGES_DIR="${OFFLINE_DIR}/images"
TAR_NAME="${IMAGE_REPO}-${VERSION}.tar.gz"
TAR_PATH="${IMAGES_DIR}/${TAR_NAME}"
SHA_PATH="${TAR_PATH}.sha256"
COMPOSE_PATH="${OFFLINE_DIR}/docker-compose.offline.yml"
MANIFEST_PATH="${OFFLINE_DIR}/BUILD-MANIFEST.txt"

echo "Building image: ${IMAGE_TAG}"
echo "Legacy tag:     ${LEGACY_TAG}"
echo "Git commit:     ${GIT_FULL_SHA}"
echo "Git branch:     ${GIT_BRANCH}"
echo "Dirty tree:     ${DIRTY}"
echo "Output dir:     ${OFFLINE_DIR}"

mkdir -p "${IMAGES_DIR}"

docker build \
  --progress=plain \
  --build-arg NODE_IMAGE="${NODE_IMAGE}" \
  --build-arg ALPINE_REPOSITORY="${ALPINE_REPOSITORY}" \
  --build-arg NPM_REGISTRY="${NPM_REGISTRY}" \
  --build-arg PIP_INDEX_URL="${PIP_INDEX_URL}" \
  --build-arg INSTALL_SCAN_CLIS="${INSTALL_SCAN_CLIS}" \
  --build-arg BUILD_GIT_SHA="${GIT_FULL_SHA}" \
  --build-arg BUILD_GIT_BRANCH="${GIT_BRANCH}" \
  --build-arg BUILD_TIME="${BUILD_TIME}" \
  --build-arg BUILD_DIRTY="${DIRTY}" \
  --build-arg BUILD_IMAGE_TAG="${IMAGE_TAG}" \
  -t "${IMAGE_TAG}" \
  -t "${LEGACY_TAG}" \
  .

IMAGE_ID="$(docker image inspect "${IMAGE_TAG}" --format '{{.Id}}')"
IMAGE_CREATED="$(docker image inspect "${IMAGE_TAG}" --format '{{.Created}}')"
IMAGE_SIZE="$(docker image inspect "${IMAGE_TAG}" --format '{{.Size}}')"

echo "Image ID:       ${IMAGE_ID}"
echo "Image created:  ${IMAGE_CREATED}"
echo "Image size:     ${IMAGE_SIZE}"

docker run --rm --entrypoint cat "${IMAGE_TAG}" /app/build-info.json

if [ -f docker-compose.offline.yml ]; then
  sed -E "s#image: zhian:1\.0\.0#image: ${IMAGE_TAG}#g" docker-compose.offline.yml > "${COMPOSE_PATH}"
fi

echo "Saving image to ${TAR_PATH}"
docker save "${IMAGE_TAG}" | gzip "-${GZIP_LEVEL}" > "${TAR_PATH}"

(
  cd "${IMAGES_DIR}"
  sha256_file "${TAR_NAME}" > "${TAR_NAME}.sha256"
)

gzip -t "${TAR_PATH}"

TAR_SHA="$(awk '{print $1}' "${SHA_PATH}")"

cat > "${MANIFEST_PATH}" <<EOF
image_tag=${IMAGE_TAG}
legacy_tag=${LEGACY_TAG}
image_id=${IMAGE_ID}
image_created=${IMAGE_CREATED}
image_size=${IMAGE_SIZE}
git_sha=${GIT_FULL_SHA}
git_branch=${GIT_BRANCH}
git_dirty=${DIRTY}
build_time=${BUILD_TIME}
tar_file=images/${TAR_NAME}
tar_sha256=${TAR_SHA}

customer_verify_commands:
  cd /data/project/zhian-offline-0710/images
  sha256sum -c ${TAR_NAME}.sha256
  gunzip -c ${TAR_NAME} | docker load
  docker image inspect ${IMAGE_TAG} --format '{{.Id}} {{.Created}}'
  docker run --rm --entrypoint cat ${IMAGE_TAG} /app/build-info.json
EOF

echo
echo "Done."
echo "Offline package: ${TAR_PATH}"
echo "Checksum:        ${SHA_PATH}"
echo "Compose file:    ${COMPOSE_PATH}"
echo "Manifest:        ${MANIFEST_PATH}"
echo
echo "On the customer host, use the generated compose file because it points to ${IMAGE_TAG}."
