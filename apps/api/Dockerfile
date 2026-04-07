FROM node:20-alpine

WORKDIR /app

# Copy workspace files
COPY package.json ./
COPY tsconfig.json ./

# Copy packages
COPY ../../packages/contracts ./packages/contracts
COPY ../../packages/db ./packages/db
COPY ../../packages/auth ./packages/auth
COPY ../../packages/queue ./packages/queue

# Install deps
RUN npm install

# Copy source
COPY src ./src

# Run migrations then start
CMD ["sh", "-c", "npm run migrate && npm run dev"]
