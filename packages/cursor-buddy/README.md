# cursor-buddy

AI-powered cursor companion for web apps. Push-to-talk voice assistant that can see your screen and point at things.

## Features

- **Push-to-talk voice input** — Hold a hotkey to speak, release to send
- **Screenshot context** — AI sees your current viewport
- **Voice responses** — Text-to-speech playback
- **Cursor pointing** — AI can point at UI elements it references
- **Framework agnostic** — Adapter-based server, works with Next.js, Express, Hono
- **Customizable** — CSS variables, custom components, headless mode

## Installation

```bash
npm install cursor-buddy
# or
pnpm add cursor-buddy
```

## Quick Start

### 1. Server Setup

Create an API route that handles chat, transcription, and TTS.

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
import { CursorBuddy } from "cursor-buddy/client"

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
  speechModel: SpeechModel,          // AI SDK speech model
  transcriptionModel: TranscriptionModel,  // AI SDK transcription model

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
  muted={false}                  // Disable TTS playback
  container={element}            // Portal container (default: document.body)

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
import { CursorBuddy, type CursorRenderProps } from "cursor-buddy/client"

function MyCursor({ state, rotation, scale }: CursorRenderProps) {
  return (
    <div style={{ transform: `rotate(${rotation}rad) scale(${scale})` }}>
      {state === "listening" ? "🎤" : "👆"}
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
} from "cursor-buddy/client"

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
    transcript,      // Latest user speech
    response,        // Latest AI response
    audioLevel,      // 0-1, for waveform visualization
    isEnabled,
    isSpeaking,
    isPointing,
    error,

    // Actions
    startListening,
    stopListening,
    setEnabled,
    speak,           // Manually trigger TTS
    pointAt,         // Manually point at coordinates
    reset,
  } = useCursorBuddy()

  return (
    <div>
      <p>State: {state}</p>
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

## Render Props Types

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

## API Reference

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

### Client Exports (`cursor-buddy/client`)

| Export | Description |
|--------|-------------|
| `CursorBuddy` | Drop-in component with built-in UI |
| `CursorBuddyProvider` | Headless provider for custom UI |
| `useCursorBuddy` | Hook to access state and actions |

### Types (`cursor-buddy/client`)

| Export | Description |
|--------|-------------|
| `CursorBuddyProps` | Props for `<CursorBuddy />` |
| `CursorBuddyProviderProps` | Props for `<CursorBuddyProvider />` |
| `CursorBuddyContextValue` | Return type of `useCursorBuddy()` |
| `CursorRenderProps` | Props passed to custom cursor |
| `SpeechBubbleRenderProps` | Props passed to custom speech bubble |
| `WaveformRenderProps` | Props passed to custom waveform |

### Core Types (`cursor-buddy`)

| Export | Description |
|--------|-------------|
| `VoiceState` | `"idle" \| "listening" \| "processing" \| "responding"` |
| `PointingTarget` | `{ x: number, y: number, label: string }` |
| `Point` | `{ x: number, y: number }` |

## How It Works

1. User holds the hotkey (Ctrl+Alt)
2. Microphone captures audio, waveform shows audio level
3. User releases hotkey
4. Screenshot of viewport is captured
5. Audio is transcribed via AI SDK
6. Screenshot + transcript sent to AI model
7. AI responds with text, optionally including `[POINT:x,y:label]` tag
8. Response is spoken via TTS
9. If pointing tag present, cursor animates to target location

## TODOS
- [ ] AI pointing at the wrong coordinates on the screen
- [ ] Faster transcription -> chat -> TTS flow (eg single endpoint instead of 3 calls)
- [ ] Composition pattern for custom components
- [ ] Better hotkey management

## License

MIT
