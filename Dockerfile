FROM denoland/deno
WORKDIR /app

COPY src ./
CMD deno run --allow-net --allow-read --allow-write --allow-env /app/main.ts