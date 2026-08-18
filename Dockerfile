FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
EXPOSE 8080
CMD ["node", "dist/index.js"]

# Load generator, run as its own container on the compose network so it hits
# the app via the internal network instead of the host's Docker Desktop port
# forward (which is a much lower-ceiling path under high concurrency).
FROM build AS loadtest
COPY scripts ./scripts
CMD ["npm", "run", "loadtest"]
