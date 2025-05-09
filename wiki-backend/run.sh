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
  registry.jgz.guru/wiki-backend
  