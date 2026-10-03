FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY tools ./tools
ENV BR_HOST=0.0.0.0 BR_PORT=8080
EXPOSE 8080
# Mount data/ (players) and captures/ (recordings) as volumes so they survive rebuilds.
VOLUME ["/app/data", "/app/captures"]
CMD ["node", "src/index.js"]
