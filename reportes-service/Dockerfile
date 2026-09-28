FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3005
ENV PORT=3005

CMD ["node", "src/app.js"]
