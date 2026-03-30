# Production Dockerfile for Ultimate System
# Optimized single-stage build for reliable deployment

FROM node:22-bookworm-slim

# Install pnpm
RUN npm install -g pnpm@10.30.3

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/*/package.json ./apps/*/
COPY packages/*/package.json ./packages/*/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build all packages
RUN pnpm build

# Create data directory
RUN mkdir -p /data

# Expose unified port
EXPOSE 8888

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const http=require('http'); const o={hostname:'localhost',port:8888,path:'/api/health',timeout:5000}; const r=http.get(o,(res)=>{process.exit(res.statusCode===200?0:1)}); r.on('error',()=>process.exit(1));"

# Start unified server
CMD ["node", "apps/unified/dist/server.js"]