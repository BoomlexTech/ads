# ---- build the React client ----
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- runtime: Express API + built client ----
FROM node:22-alpine
ENV NODE_ENV=production PORT=5000
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY --from=client /app/client/dist ./client/dist
# local-disk upload fallback (only used when Cloudinary is not configured)
RUN mkdir -p server/uploads && chown -R node:node /app
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:5000/api/health || exit 1
CMD ["node", "server/index.js"]
