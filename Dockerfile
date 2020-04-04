FROM node:13.10.1-stretch
WORKDIR /usr/src/app
COPY package.json ./
COPY package-lock.json ./
RUN npm i
COPY server.js ./
CMD npm run start