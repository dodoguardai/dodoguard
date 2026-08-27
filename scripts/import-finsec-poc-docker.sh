#!/usr/bin/env bash
# 金融证券 POC 漏洞库 — 客户 Docker 环境增量导入（不删不改其它数据）
#
# 用法（在含 docker-compose.yml 的目录执行）:
#   bash import-finsec-poc-docker.sh
#   bash import-finsec-poc-docker.sh --compose docker-compose.offline.yml
#   bash import-finsec-poc-docker.sh --sql /path/to/insert-financial-securities-poc-vulnerabilities.sql
#
# 环境变量（可选，覆盖默认）:
#   MYSQL_SERVICE=mysql
#   MYSQL_USER=zhian
#   MYSQL_PASSWORD=zhian12345
#   MYSQL_DATABASE=zhian

set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
SQL_FILE=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MYSQL_SERVICE="${MYSQL_SERVICE:-mysql}"
MYSQL_USER="${MYSQL_USER:-zhian}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-zhian12345}"
MYSQL_DATABASE="${MYSQL_DATABASE:-zhian}"
BATCH_MARK="finsec-poc-20260608"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --compose)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --sql)
      SQL_FILE="$2"
      shift 2
      ;;
    -h | --help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$SQL_FILE" ]]; then
  SQL_FILE="${SCRIPT_DIR}/insert-financial-securities-poc-vulnerabilities.sql"
fi

if [[ ! -f "$SQL_FILE" ]]; then
  echo "SQL file not found: $SQL_FILE" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE (run from deploy root or pass --compose)" >&2
  exit 1
fi

echo "==> Compose: $COMPOSE_FILE"
echo "==> MySQL service: $MYSQL_SERVICE / db: $MYSQL_DATABASE"
echo "==> SQL: $SQL_FILE"
echo "==> Mode: INSERT only + ON DUPLICATE KEY UPDATE (no DELETE/TRUNCATE)"

if ! docker compose -f "$COMPOSE_FILE" ps --status running "$MYSQL_SERVICE" 2>/dev/null | grep -q "$MYSQL_SERVICE"; then
  echo "MySQL container not running. Start stack first, e.g.:" >&2
  echo "  docker compose -f $COMPOSE_FILE up -d" >&2
  exit 1
fi

echo "==> Importing..."
docker compose -f "$COMPOSE_FILE" exec -T "$MYSQL_SERVICE" \
  mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" <"$SQL_FILE"

echo "==> Verify batch count:"
docker compose -f "$COMPOSE_FILE" exec -T "$MYSQL_SERVICE" \
  mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e \
  "SELECT COUNT(*) AS finsec_poc_rows FROM vulnerabilities WHERE fingerprint = '${BATCH_MARK}';"

echo "==> Sample rows:"
docker compose -f "$COMPOSE_FILE" exec -T "$MYSQL_SERVICE" \
  mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e \
  "SELECT avd_id, name, category, verification_mode FROM vulnerabilities WHERE fingerprint = '${BATCH_MARK}' ORDER BY avd_id LIMIT 5;"

echo "Done. Refresh Web UI task wizard to see new vulnerabilities at list top."
