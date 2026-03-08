FROM node:20-alpine

WORKDIR /app

RUN npm install -g ts-node typescript

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5000

CMD ["ts-node", "backend/server.ts"]