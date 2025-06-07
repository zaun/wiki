# Use an official Node.js runtime
FROM node:23-slim

LABEL image-name="wiki-backend"
LABEL maintainer="your-email@example.com"
LABEL version="1.0.0"

# REST API BACKEND
WORKDIR /usr/src/rest

COPY rest/package*.json ./
RUN npm ci --omit=dev

COPY rest/index.js .
COPY rest/util.js .
COPY rest/api ./api/
COPY rest/storage ./storage/

# AI WORKBER BACKEND
WORKDIR /usr/src/ai_worker

COPY ai_worker/package*.json ./
RUN npm ci --omit=dev

COPY ai_worker/index.js .

# STARTUP SCRIPT
WORKDIR /usr/src

RUN cat <<EOF > start.sh
#!/bin/bash
# node ./ai_worker/index.js &
node ./rest/index.js
EOF

RUN chmod +x start.sh

# Environment variables
ENV PORT=3000
ENV HTTPS_PORT=3030
ENV CORS_ORIGIN=""
ENV TLS_CERTIFICATE=""
ENV TLS_KEY=""

# Database config
ENV DB_URL=bolt://localhost:7687
ENV DB_USER=neo4j
ENV DB_PASSWORD=password
ENV DB_LOG_LEVEL="none"

# Expose HTTP and HTTPS
EXPOSE 3000 3030


CMD ["/usr/src/start.sh"]
