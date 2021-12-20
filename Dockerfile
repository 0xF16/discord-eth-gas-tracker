FROM node:16.13-alpine

WORKDIR /app
COPY package.json yarn.lock index.js ./

RUN rm -rf node_modules && yarn install --frozen-lockfile

CMD ["node", "index.js"]