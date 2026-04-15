# cursor-buddy


https://github.com/user-attachments/assets/3cdfe011-aee2-4c8e-b695-34f83a972593


AI Agent that lives in your cursor, built for web apps. Push-to-talk voice assistant that can see your screen and point at things.

Customize its prompt, pass custom tools, choose between browser or server-side speech APIs, use any AI SDK models and customize the UI to fit your needs.

## Features

- **Push-to-talk voice input** — Hold a hotkey to speak, release to send
- **Browser-first live transcription** — Realtime transcript while speaking, with server fallback
- **Annotated screenshot context** — AI sees your current viewport with numbered interactive elements
- **Voice responses** — Browser or server TTS, with optional streaming playback
- **Cursor pointing** — AI can point at UI elements it references
- **Voice interruption** — Start talking again to cut off current response
- **Framework agnostic** — Core client written in Typescript, adapter-based architecture
- **Customizable** — CSS variables, custom components, headless mode
- **Configurable** — Choose any AI SDK models, equip the agent with tools, or modify the system prompt

## Installation

```bash
npm install cursor-buddy
# or
pnpm add cursor-buddy
```

## Quick Start

### 1. Server Setup

Create an API route that handles chat, transcription, and TTS.

Keep `transcriptionModel` configured if you want browser transcription to fall
back to the server in `auto` mode. Keep `speechModel` configured if you want
server speech or browser speech fallback in `auto` mode.

```ts
// lib/cursor-buddy.ts
import { createCursorBuddyHandler } from "cursor-buddy/server"
import { openai } from "@ai-sdk/openai"

export const cursorBuddy = createCursorBuddyHandler({
  model: openai("gpt-4o"),
  speechModel: openai.speech("tts-1"),
  transcriptionModel: openai.transcription("whisper-1"),
})
```

#### Next.js App Router

```ts
// app/api/cursor-buddy/[...path]/route.ts
import { toNextJsHandler } from "cursor-buddy/server/next"
import { cursorBuddy } from "@/lib/cursor-buddy"

export const { GET, POST } = toNextJsHandler(cursorBuddy)
```

### 2. Client Setup

Add the `<CursorBuddy />` component to your app.

```tsx
// app/layout.tsx
import { CursorBuddy } from "cursor-buddy/react"

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <CursorBuddy endpoint="/api/cursor-buddy" />
      </body>
    </html>
  )
}
```

That's it! Hold **Ctrl+Alt** to speak, release to send.

## Server Configuration

```ts
createCursorBuddyHandler({
  // Required
  model: LanguageModel,              // AI SDK chat model
  speechModel: SpeechModel,          // Optional server TTS model
  transcriptionModel: TranscriptionModel,  // Optional server fallback for STT

  // Optional
  system: string | ((ctx) => string),  // Custom system prompt
  tools: Record<string, Tool>,         // AI SDK tools
  maxHistory: number,                  // Max conversation history (default: 10)
})
```

### Custom System Prompt

```ts
createCursorBuddyHandler({
  model: openai("gpt-4o"),
  speechModel: openai.speech("tts-1"),
  transcriptionModel: openai.transcription("whisper-1"),

  // Extend the default prompt
  system: ({ defaultPrompt }) => `
    ${defaultPrompt}

    You are helping users navigate a project management dashboard.
    The sidebar contains: Projects, Tasks, Calendar, Settings.
  `,
})
```

## Client Configuration

```tsx
<CursorBuddy
  // Required
  endpoint="/api/cursor-buddy"

  // Optional
  hotkey="ctrl+alt"              // Push-to-talk hotkey (default: "ctrl+alt")
  container={element}            // Portal container (default: document.body)
  transcription={{ mode: "auto" }} // "auto" | "browser" | "server"
  speech={{ mode: "server", allowStreaming: false }}
  // mode: "auto" | "browser" | "server"
  // allowStreaming: speak sentence-by-sentence while chat streams

  // Custom components
  cursor={(props) => <CustomCursor {...props} />}
  speechBubble={(props) => <CustomBubble {...props} />}
  waveform={(props) => <CustomWaveform {...props} />}

  // Callbacks
  onTranscript={(text) => {}}    // Called when speech is transcribed
  onResponse={(text) => {}}      // Called when AI responds
  onPoint={(target) => {}}       // Called when AI points at element
  onStateChange={(state) => {}}  // Called on state change
  onError={(error) => {}}        // Called on error
/>
```

### Transcription Modes

- `"auto"` — Try browser speech recognition first, then fall back to the
  server transcription route if needed.
- `"browser"` — Require browser speech recognition. If it fails, the turn
  errors and no server fallback is attempted.
- `"server"` — Skip browser speech recognition and always use the server
  transcription route.

### Speech Modes

- `"auto"` — Try browser speech synthesis first, then fall back to the server
  TTS route if browser speech is unavailable or fails.
- `"browser"` — Require browser speech synthesis. If it fails, the turn
  errors and no server fallback is attempted.
- `"server"` — Skip browser speech synthesis and always use the server TTS
  route.

### Speech Streaming

- `speech.allowStreaming: false` — Wait for the full `/chat` response, then
  speak it once.
- `speech.allowStreaming: true` — Speak completed sentence segments as the chat
  stream arrives.

## Customization

### CSS Variables

Cursor buddy styles are customizable via CSS variables. Override them in your stylesheet:

```css
:root {
  /* Cursor colors by state */
  --cursor-buddy-color-idle: #3b82f6;
  --cursor-buddy-color-listening: #ef4444;
  --cursor-buddy-color-processing: #eab308;
  --cursor-buddy-color-responding: #22c55e;

  /* Speech bubble */
  --cursor-buddy-bubble-bg: #ffffff;
  --cursor-buddy-bubble-text: #1f2937;
  --cursor-buddy-bubble-radius: 8px;
  --cursor-buddy-bubble-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

  /* Waveform */
  --cursor-buddy-waveform-color: #ef4444;
}
```

### Custom Components

Replace default components with your own:

```tsx
import { CursorBuddy, type CursorRenderProps } from "cursor-buddy/react"

function MyCursor({ state, rotation, scale }: CursorRenderProps) {
  return (
    <div style={{ transform: `rotate(${rotation}rad) scale(${scale})` }}>
      {state === "listening" ? "Listening..." : "Point"}
    </div>
  )
}

<CursorBuddy
  endpoint="/api/cursor-buddy"
  cursor={(props) => <MyCursor {...props} />}
/>
```

## Headless Mode

For full control, use the provider and hook directly:

```tsx
import {
  CursorBuddyProvider,
  useCursorBuddy
} from "cursor-buddy/react"

function App() {
  return (
    <CursorBuddyProvider endpoint="/api/cursor-buddy">
      <MyCustomUI />
    </CursorBuddyProvider>
  )
}

function MyCustomUI() {
  const {
    state,           // "idle" | "listening" | "processing" | "responding"
    liveTranscript,  // In-progress transcript while speaking
    transcript,      // Latest user speech
    response,        // Latest AI response
    audioLevel,      // 0-1, for waveform visualization
    isEnabled,
    isPointing,
    error,

    // Actions
    startListening,
    stopListening,
    setEnabled,
    pointAt,         // Manually point at coordinates
    dismissPointing,
    reset,
  } = useCursorBuddy()

  return (
    <div>
      <p>State: {state}</p>
      <p>Live transcript: {liveTranscript}</p>
      <button
        onMouseDown={startListening}
        onMouseUp={stopListening}
      >
        Hold to speak
      </button>
    </div>
  )
}
```

Complete Render Props types:

```ts
interface CursorRenderProps {
  state: "idle" | "listening" | "processing" | "responding"
  isPointing: boolean
  rotation: number   // Radians, direction of travel
  scale: number      // 1.0 normal, up to 1.3 during flight
}

interface SpeechBubbleRenderProps {
  text: string
  isVisible: boolean
}

interface WaveformRenderProps {
  audioLevel: number  // 0-1
  isListening: boolean
}
```

## Framework-Agnostic Usage

For non-React environments, use the core client directly:

```ts
import { CursorBuddyClient } from "cursor-buddy"

const client = new CursorBuddyClient("/api/cursor-buddy", {
  transcription: { mode: "auto" },
  speech: { mode: "server", allowStreaming: false },
  onStateChange: (state) => console.log("State:", state),
  onTranscript: (text) => console.log("Transcript:", text),
  onResponse: (text) => console.log("Response:", text),
  onError: (err) => console.error("Error:", err),
})

// Subscribe to state changes
client.subscribe(() => {
  const snapshot = client.getSnapshot()
  console.log(snapshot)
})

// Trigger voice interaction
client.startListening()
// ... user speaks ...
client.stopListening()
```

## API Reference

### Core Exports (`cursor-buddy`)

| Export | Description |
|--------|-------------|
| `CursorBuddyClient` | Framework-agnostic client class |
| `VoiceState` | Type: `"idle" \| "listening" \| "processing" \| "responding"` |
| `PointingTarget` | Type: `{ x: number, y: number, label: string }` |
| `Point` | Type: `{ x: number, y: number }` |

### Server Exports (`cursor-buddy/server`)

| Export | Description |
|--------|-------------|
| `createCursorBuddyHandler` | Create the main request handler |
| `DEFAULT_SYSTEM_PROMPT` | Default system prompt for reference |
| `CursorBuddyHandlerConfig` | Type for handler configuration |
| `CursorBuddyHandler` | Return type of `createCursorBuddyHandler` |

### Server Adapters (`cursor-buddy/server/next`)

| Export | Description |
|--------|-------------|
| `toNextJsHandler` | Convert handler to Next.js App Router format |

### React Exports (`cursor-buddy/react`)

| Export | Description |
|--------|-------------|
| `CursorBuddy` | Drop-in component with built-in UI |
| `CursorBuddyProvider` | Headless provider for custom UI |
| `useCursorBuddy` | Hook to access state and actions |

### Types (`cursor-buddy/react`)

| Export | Description |
|--------|-------------|
| `CursorBuddyProps` | Props for `<CursorBuddy />` |
| `CursorBuddyProviderProps` | Props for `<CursorBuddyProvider />` |
| `UseCursorBuddyReturn` | Return type of `useCursorBuddy()` |
| `CursorRenderProps` | Props passed to custom cursor |
| `SpeechBubbleRenderProps` | Props passed to custom speech bubble |
| `WaveformRenderProps` | Props passed to custom waveform |

## How It Works

1. User holds the hotkey
2. Microphone captures audio, waveform shows audio level, and browser speech recognition starts when available
3. User releases hotkey
4. An annotated screenshot of the viewport is captured, with numbered markers on visible interactive elements, based on [agent-browser](https://github.com/vercel-labs/agent-browser) implementation.
5. The client prefers the browser transcript; if it is unavailable or empty in `auto` mode, the recorded audio is transcribed on the server
6. Screenshot + marker context are sent to the AI model
7. AI responds with text, optionally including a pointing tag:
   - Preferred: `[POINT:5:Submit]` for numbered interactive elements
   - Fallback: `[POINT:640,360:Error text]` for arbitrary screen coordinates
8. Response is spoken in the browser or on the server based on `speech.mode`,
   and can either wait for the full response or stream sentence-by-sentence
   based on `speech.allowStreaming`
9. If a marker tag is present, it is resolved back to the live DOM element; if a coordinate tag is present, it is mapped back to the live viewport; then the cursor animates to the target location
10. **If user presses hotkey again at any point, current response is interrupted**

## Security Best Practices

Since the cursor-buddy endpoints allow direct LLM communication, it is strongly recommended to configure CORS and rate limiting to prevent abuse, unauthorized access, and unexpected API costs.

Wrap the handler with CORS and rate limiting:

```ts
// app/api/cursor-buddy/[...path]/route.ts
import { toNextJsHandler } from "cursor-buddy/server/next"
import { cursorBuddy } from "@/lib/cursor-buddy"

const handler = toNextJsHandler(cursorBuddy)

export async function POST(request: Request) {
  // Verify origin
  const origin = request.headers.get("origin")
  if (origin !== process.env.ALLOWED_ORIGIN) {
    return new Response("Unauthorized", { status: 403 })
  }

  // Check rate limit (e.g., 10 requests per minute)
  const ip = request.headers.get("x-forwarded-for") || "unknown"
  const { success } = await rateLimiter.limit(ip)
  if (!success) {
    return new Response("Rate limit exceeded", { status: 429 })
  }

  return handler(request)
}

export const GET = POST
```

## TODOs

- [ ] High: Make tool calls first class: Pointing becomes tool call (once per turn) + re-use pointing bubble UI for tool calls
- [ ] Medium: Proper test structure without relying on `as any` for audio and voice capture

## License

MIT
