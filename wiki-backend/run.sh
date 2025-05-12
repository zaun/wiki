podman run -d --name wiki-backend \
  --replace \
  -p 3000:3000 \
  -e DB_PORT=3000 \
  -e DB_URL="bolt://neo4j.jgz.guru:7687" \
  -e DB_USER="neo4j" \
  -e DB_PASSWORD="zowbor-9meqso-zihkeH" \
  -e CORS_ORIGIN="http://localhost:5173" \
  -e BUCKET="unending-wiki" \
  -e S3_KEY="nCK8MtHtdWcymRz8Rvrd" \
  -e S3_SECRET="AozUUMfG2TiSf6KrwITVA4xNHsfpyUOGPcuXQxH9" \
  -e S3_ENDPOINT="https://storage.jgz.guru:5732" \
  -e RECOVERY_KEY_SALT=9db9b172072a615f04b8998425c0025a95736c71f59245a88fbbeb6f12d93e51 \
  -e JWT_SECRET=a7e976d3628c625b03601295a503fc4368126529157c2737579ef8844031998c \
  registry.jgz.guru/wiki-backend
