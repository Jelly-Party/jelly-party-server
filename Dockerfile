FROM node:14.5.0-stretch
WORKDIR /usr/src/app
COPY package.json ./
COPY package-lock.json ./
RUN npm i
COPY server.ts ./
COPY tsconfig.json ./
CMD npm run start