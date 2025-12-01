# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**观想阁 (Prompt Canvas)** - A React application for managing AI prompts with two modes:
- **Image prompts**: Visual canvas with draggable cards, image generation via Gemini, and video prompt conversion
- **Text prompts**: Chat interface for reasoning/logic prompts with multimodal support

## Development Commands

```bash
npm install              # Install dependencies
npm run dev              # Start Vite dev server (port 3000, frontend only)
npm run build            # Production build
npm run preview          # Preview production build

# EdgeOne Pages Commands (requires: npm install -g edgeone)
npm run pages:dev        # Start EdgeOne local dev server (frontend + edge functions)
npm run pages:deploy     # Deploy to EdgeOne Pages
```

## Environment Setup

1. Copy `.env.example` to `.env.local`
2. Set `GEMINI_API_KEY` in `.env.local` (for local EdgeOne dev)
3. Configure `GEMINI_API_KEY` in EdgeOne console for production

The key should start with "AIza" and contain no quotes or whitespace.

## Architecture

### Tech Stack
- React 19 + TypeScript
- Vite 6 (dev server and build)
- EdgeOne Pages (deployment platform)
- EdgeOne Edge Functions (API gateway)
- IndexedDB for local storage (offline-first)
- React Router (HashRouter)
- Tailwind CSS

### Project Structure

```
prompt_canvas/
├── dist/                              # Vite build output
├── edge-functions/                    # EdgeOne Edge Functions
│   └── api/
│       └── gemini/
│           └── [[default]].js         # Unified Gemini API gateway
├── services/
│   ├── geminiService.ts               # Frontend API client (calls /api/gemini/*)
│   └── storageService.ts              # IndexedDB operations
├── components/
│   ├── ImageCanvas.tsx                # Infinite canvas for image prompts
│   ├── ChatInterface.tsx              # Chat UI for text prompts
│   ├── DiffViewer.tsx                 # Prompt version diff display
│   └── VideoModal.tsx                 # Video settings configuration
├── App.tsx                            # Main app with routing
├── types.ts                           # TypeScript interfaces
├── vite.config.ts                     # Vite configuration
└── package.json
```

### Edge Functions API Routes

All Gemini API calls are proxied through Edge Functions at `/api/gemini/*`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/gemini/classify` | POST | Classify prompt as IMAGE or TEXT |
| `/api/gemini/generate-image` | POST | Generate image from prompt |
| `/api/gemini/chat` | POST | Chat with AI (multimodal) |
| `/api/gemini/video-prompt` | POST | Convert to video prompt |
| `/api/gemini/health` | GET | API key diagnostics |

### Key Data Models (`types.ts`)

- **PromptItem**: Main entity with `type` (IMAGE/TEXT/VIDEO_PLAN), `versions[]`, `chatHistory[]`
- **PromptVersion**: For image prompts - stores text, imageUrl, canvas position (x,y), videoSettings
- **ChatMessage**: For text prompts - role (user/model), text, attachments

### Service Layer

**geminiService.ts** (Frontend):
- All functions call `/api/gemini/*` endpoints via fetch
- No direct Gemini SDK usage in frontend
- API key is stored server-side only

**storageService.ts**:
- IndexedDB database `PromptCanvasDB` with `users` and `prompts` stores
- Session management via localStorage
- Export/import JSON for cross-device sync

### Routing Structure

Uses HashRouter with authenticated routes:
- `/login` - Login/Register page
- `/dashboard` - Quick add prompt with auto-classification
- `/library` - Prompt library with category filters (?category=visual|text)
- `/prompt/:id` - Detail view (ImageCanvas or ChatInterface based on type)
- `/settings` - Data export/import and API diagnostics

### ImageCanvas Features

- Infinite pan/zoom canvas with grid background
- Draggable version cards with snap-to-align guides
- Auto-layout (horizontal/vertical alignment)
- Reference image support for image-to-image generation
- Collapsible prompt editor with fullscreen mode

## Deployment

### EdgeOne Pages Deployment

```bash
# Install EdgeOne CLI globally
npm install -g edgeone

# Login to EdgeOne
edgeone login

# Initialize project (first time)
edgeone pages init

# Deploy
npm run pages:deploy
# or
edgeone pages deploy
```

### Environment Variables (EdgeOne Console)

Configure in EdgeOne Pages project settings:
- `GEMINI_API_KEY`: Your Google Gemini API key
