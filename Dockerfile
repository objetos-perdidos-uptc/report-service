FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p uploads
EXPOSE 8082
ENTRYPOINT ["node", "src/index.js"]
