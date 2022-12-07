FROM denoland/deno
WORKDIR /usr/src/app

COPY server.ts ./
CMD npm run start