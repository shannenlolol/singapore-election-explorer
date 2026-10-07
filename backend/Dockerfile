FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node app.js config.js db.js server.js ./
COPY --chown=node:node controllers ./controllers
COPY --chown=node:node routes ./routes
COPY --chown=node:node domain ./domain
COPY --chown=node:node services ./services
COPY --chown=node:node scripts ./scripts
USER node
EXPOSE 4000
CMD ["node", "server.js"]
