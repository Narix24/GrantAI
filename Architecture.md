graph TD
  A[Frontend] -->|API Requests| B(API Gateway)
  B --> C[Auth Service]
  B --> D[Proposal Service]
  B --> E[Grant Discovery Service]
  B --> F[System Service]
  
  D --> G[Proposal Writer Agent]
  D --> H[Tone Analyzer Agent]
  D --> I[Voice Playback Agent]
  
  E --> J[Grant Crawler Agent]
  
  G --> K[AI Service Router]
  K --> L[Gemini]
  K --> M[OpenAI]
  K --> N[Ollama]
  
  G --> O[Vector Store]
  O --> P[ChromaDB]
  O --> Q[SQLite Fallback]
  
  D --> R[Job Queue]
  R --> S[Writer Worker]
  R --> T[Submitter Worker]
  R --> U[Scraper Worker]
  
  R --> V[Chaos Monkey]
  V --> W[Recovery Orchestrator]