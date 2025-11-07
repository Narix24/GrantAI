# 🚀 Grant-AI: Intelligent Proposal Generation Engine

[![CI](https://github.com/grant-ai/production/actions/workflows/ci.yml/badge.svg)](https://github.com/grant-ai/production/actions/workflows/ci.yml)
[![CD](https://github.com/grant-ai/production/actions/workflows/cd.yml/badge.svg)](https://github.com/grant-ai/production/actions/workflows/cd.yml)
[![Chaos](https://github.com/grant-ai/production/actions/workflows/chaos-test.yml/badge.svg)](https://github.com/grant-ai/production/actions/workflows/chaos-test.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Grant-AI is a multilingual, agentic proposal generation engine built for global scale. It combines AI-powered writing, grant discovery, voice playback, tone detection, calendar sync, and chaos-resilient orchestration. The system is modular, self-healing, and dynamically routes between Gemini, OpenAI, and Ollama.

## 🌟 Key Features

- ✍️ **AI-Powered Proposal Generation**: Create compelling grant proposals in seconds
- 🌍 **10-Language Support**: Automatic prompt localization and translation
- 🧠 **RAG Engine**: Context-aware responses using ChromaDB vector store
- 📤 **Email Submission**: SMTP-based delivery with DKIM signing
- 🗣️ **Voice Playback**: Text-to-speech synthesis for accessibility
- 📅 **Calendar Sync**: Google Calendar integration for deadline reminders
- 🧠 **Tone Detection**: Classifies proposal tone for funder alignment
- 🔁 **Deduplication**: Semantic similarity checks to avoid repetition
- 📊 **Infographic Injection**: ChartJS-based visual summaries
- 🔍 **Grant Discovery**: Puppeteer + Cheerio scraping of funding portals
- 🧩 **SQLite Fallback**: Offline mode and disaster recovery support
- 🔁 **MCP Orchestration**: BullMQ-powered task queue with chaos resilience
- 🐒 **ChaosMonkey**: Random failure injection for stress testing
- 🔄 **RecoveryOrchestrator**: Auto-retries failed jobs for self-healing behavior

## 🚀 Quick Start

### Prerequisites
- Node.js v20+
- Docker & Docker Compose
- MongoDB v6+
- Redis v7+

### Installation
```bash
# Clone the repository
git clone https://github.com/grant-ai/production.git
cd grant-ai

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your configuration

# Start development environment
docker-compose up -d
npm run dev