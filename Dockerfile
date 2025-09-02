# Usa la imagen oficial de Node.js como base
# Recomiendo usar una versión específica, como node:20-alpine
# para un tamaño de imagen más pequeño
FROM node:20-alpine

# Define el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copia los archivos de configuración y dependencias
# (package.json y package-lock.json) para que se instalen
COPY package*.json ./

# Instala las dependencias del proyecto
RUN npm install

# Copia el resto de los archivos de tu proyecto al contenedor
COPY . .

# Expone el puerto en el que tu aplicación va a escuchar.
# En tu archivo `server.js`, probablemente esté definido como 3000
EXPOSE 4000

# El comando para iniciar la aplicación cuando el contenedor se ejecute
CMD ["node", "server.js"]