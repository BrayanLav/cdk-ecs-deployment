# Multi-stage build (buena práctica: imagen final más pequeña)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine
WORKDIR /app
# No correr como root (buena práctica de seguridad)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /app/node_modules ./node_modules
COPY server.js .
USER appuser
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://localhost:80/health || exit 1
CMD ["node", "server.js"]
