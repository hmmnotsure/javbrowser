FROM node:22-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package.json server.js ./
COPY public ./public

ENV PORT=3000
ENV MEDIA_ROOT=/media
ENV HOST_PATH=

EXPOSE 3000
CMD ["npm", "start"]
