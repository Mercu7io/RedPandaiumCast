# RedPandaium Cast

RedPandaium Cast is a high-performance, lightweight media player designed to stream content with a focus on accessibility and cloud-integrated AI features. It allows users to generate subtitles on-the-fly using a serverless AI approach.

## 🚀 Key Features

- **Dynamic Content Integration:** Browse and stream media via the JW Mediator API.
- **High-Speed AI Subtitles:**
  - **Transcription:** Utilizes **Groq Cloud (Whisper-large-v3)** for near-instant speech-to-text.
  - **Translation:** Efficient VTT translation via the **Google Translate API**.
  - **Reference-First Logic:** Always transcribes to English first before translating to ensure the highest possible accuracy.
- **Backend Audio Optimization:** Automatically extracts and compresses audio (via FFmpeg) to 32kbps mono MP3s. This ensures rapid uploads and stays well within API file size limits.
- **Customizable UI:**
  - **Subtitle Styling:** Real-time adjustment of font size, text color, and background opacity.
  - **Persistence:** Remembers playback position (timestamp) and subtitle settings across sessions.
- **Chromecast Support:** Built-in integration for SMPlayer Chromecast.
- **Responsive Design:** Modern interface built with Vue 3 and Vuetify 3.

## 🛠️ Tech Stack

### Frontend
- **Vue 3** (Vite)
- **Vuetify 3** (Material Design)
- **Pinia** (State Management)

### Backend (Orchestrator)
- **Node.js** (Express)
- **FFmpeg:** For server-side audio extraction.
- **Log Management:** Built-in log rotation (5MB limit) to preserve disk space.
- **Groq SDK:** Cloud-based Whisper transcription.

### Infrastructure
- **Docker & Docker Compose**

## 📦 Installation & Deployment

### Prerequisites
- Docker & Docker Compose
- A **Groq API Key** (Free at [console.groq.com](https://console.groq.com))

---

### Option 1: Fast Deployment with Pre-built Image (Recommended)

You don't need to clone the repository or build anything locally. Simply create a `docker-compose.yml` and `.env` file on your server:

1. **Create `.env`:**
   ```env
   GROQ_API_KEY=gsk_your_api_key_here
   ```

2. **Create `docker-compose.yml`:**
   ```yaml
   services:
     jw-cast:
       image: ghcr.io/mercu7io/redpandaiumcast:latest
       container_name: jw-cast
       restart: unless-stopped
       ports:
         - "3000:3000"
       environment:
         - GROQ_API_KEY=${GROQ_API_KEY}
       volumes:
         - ./log:/app/log
   ```

3. **Start the application:**
   ```bash
   docker compose pull && docker compose up -d
   ```

To update to the newest version anytime:
```bash
docker compose pull && docker compose up -d
```

---

### Option 2: Development / Build from Source

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Mercu7io/RedPandaiumCast.git
   cd RedPandaiumCast
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and set your GROQ_API_KEY
   ```

3. **Build and run locally with Docker:**
   ```bash
   docker compose up -d --build
   ```

### 🛡️ Security & Performance
Zero-Footprint AI: No heavy local models. All AI processing is offloaded to Groq Cloud, reducing server RAM requirements by ~8GB compared to self-hosted Whisper.

Auto-Cleanup: Temporary media files used for transcription are deleted immediately after the API call completes.

Log Rotation: The backend automatically renames backend.log to backend.log.old once it hits 5MB, ensuring logs never consume significant storage.

### 📝 Disclaimer
This is an independent open-source project. It is not an official application and is not affiliated with any specific organization. It is designed for personal study and accessibility research.
