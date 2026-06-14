# Use uma imagem base Node.js oficial
FROM node:20-alpine

# Defina o diretório de trabalho dentro do contêiner
WORKDIR /app

# Copie os arquivos package.json e package-lock.json (ou yarn.lock)
COPY package*.json ./

# Instale as dependências do projeto
RUN npm install --production

# Copie o restante do código da aplicação
COPY . .

# Exponha a porta que a aplicação irá escutar
EXPOSE 3001

# Comando para iniciar a aplicação
CMD ["npm", "start"]
