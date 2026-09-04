# Imagen base ligera de Node.js
FROM node:20-alpine

WORKDIR /usr/src/app

# Instalar dependencias primero (aprovecha cache de Docker)
COPY package*.json ./
RUN npm install --production

# Copiar el resto del codigo fuente
COPY . .

# Puerto en el que escucha el microservicio
EXPOSE 3001

ENV PORT=3001

CMD ["node", "src/app.js"]
