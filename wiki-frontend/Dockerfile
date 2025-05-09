# Use an official Node.js runtime
FROM node:23-slim

LABEL image-name="base-website"
LABEL maintainer="your-email@example.com"
LABEL version="1.0.2"

# 1) Set working dir
WORKDIR /usr/src/app

# 2) Copy only package files and install deps first
COPY app/package*.json ./
RUN npm ci --only=production

# 3) Copy your server sources
COPY app/index.js ./index.js

# 4) Copy the pre-built Vue dist into a static folder
COPY website/dist/ ./static

# 5) Expose & run
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "index.js"]
