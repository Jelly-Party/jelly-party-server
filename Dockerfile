FROM node:20.2-slim
WORKDIR /usr/src/app
COPY package.json ./
COPY package-lock.json ./
RUN npm i
COPY server.ts ./
COPY tsconfig.json ./
CMD npm run start