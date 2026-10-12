FROM node:24-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-alpine AS backend-deps
WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY backend/package*.json ./backend/
COPY --from=backend-deps /build/backend/node_modules ./backend/node_modules
COPY backend/src/ ./backend/src/
COPY --from=frontend-build /build/frontend/dist ./frontend/dist
RUN mkdir -p backend/uploads && chown -R node:node /app
USER node
EXPOSE 5000
CMD ["npm", "start"]
