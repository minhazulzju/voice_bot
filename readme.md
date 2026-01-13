# AuraVoice AI

A Next.js 14 application demonstrating real-time voice interaction using OpenAI's Realtime API.

## Features

- Real-time voice conversation with OpenAI
- 3D Audio Visualization using React Three Fiber
- Low latency WebSocket communication
- VAD (Voice Activity Detection) integration

## Setup

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy `.env` to `.env.local` (optional, or just edit .env)
   - Add your OpenAI API key to `NEXT_PUBLIC_OPENAI_API_KEY`
   - Add your Deepgram key to `NEXT_PUBLIC_DEEPGRAM_API_KEY`
   - Azure Speech TTS (used for responses):
     - `AZURE_SPEECH_KEY` = your Speech resource key
     - `AZURE_SPEECH_REGION` = `eastasia` (or your region)
   - Note: ElevenLabs is no longer used.
4. Run the development server:

   ```bash
   npm run dev
   ```

## Tech Stack

- Next.js 14
- OpenAI Realtime API
- Three.js / React Three Fiber
- TailwindCSS
