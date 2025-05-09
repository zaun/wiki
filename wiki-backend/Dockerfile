# Use an official Node.js runtime
FROM node:23-slim

LABEL image-name="wiki-backend"
LABEL maintainer="your-email@example.com"
LABEL version="1.0.0"

# Set working dir
WORKDIR /usr/src/app

# Copy only package files and install deps first
COPY app/package*.json ./
RUN npm ci --omit=dev

# Copy your server sources
COPY app/index.js .
COPY app/api ./api/
COPY app/storage ./storage/

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

CMD ["node", "index.js"]
