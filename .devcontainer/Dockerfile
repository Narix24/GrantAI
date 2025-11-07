# Use official Node.js 20 image as base
FROM mcr.microsoft.com/devcontainers/typescript-node:20

# Install system dependencies
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y \
    git \
    curl \
    wget \
    ca-certificates \
    gnupg \
    lsb-release \
    apt-transport-https \
    build-essential \
    python3 \
    python3-pip \
    libssl-dev \
    libffi-dev \
    libpq-dev \
    libsqlite3-dev \
    pkg-config \
    chromium \
    fonts-noto \
    fonts-liberation \
    libfontconfig \
    libgbm-dev \
    libxshmfence-dev \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI
RUN curl -fsSL https://get.docker.com | sh

# Install Prisma
RUN npm install -g prisma

# Set up non-root user with sudo privileges
ARG USERNAME=node
ARG USER_UID=1000
ARG USER_GID=$USER_UID
RUN if [ "$USER_UID" != "1000" ] || [ "$USER_GID" != "1000" ]; then \
        groupmod --gid $USER_GID $USERNAME && \
        usermod --uid $USER_UID --gid $USER_GID $USERNAME && \
        chown -R $USER_UID:$USER_GID /home/$USERNAME; \
    fi

# Set working directory
WORKDIR /workspaces/grant-ai

# Copy package files for dependency installation
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --include=dev

# Install Puppeteer dependencies
RUN npm rebuild puppeteer --update-binary

# Copy the rest of the application
COPY . .

# Set environment variables for development
ENV NODE_ENV=development
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Expose ports
EXPOSE 3000 3001 5432 6379 8000 27017

# Configure non-root user
USER $USERNAME

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start development servers
CMD ["npm", "run", "dev:container"]