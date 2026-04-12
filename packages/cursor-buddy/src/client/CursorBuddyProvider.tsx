"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActor } from "@xstate/react";
import { useStore } from "@nanostores/react";
import { CursorBuddyContext, type CursorBuddyContextValue } from "./context";
import { cursorBuddyMachine } from "../core/machine";
import {
  $audioLevel,
  $isEnabled,
  $isSpeaking,
  $pointingTarget,
  $conversationHistory,
  $buddyPosition,
  $buddyRotation,
  $buddyScale,
  $cursorPosition,
} from "../core/atoms";
import { parsePointingTag, stripPointingTag } from "../core/pointing";
import { animateBezierFlight } from "../core/bezier";
import { useVoiceCapture } from "./hooks/useVoiceCapture";
import { useScreenCapture } from "./hooks/useScreenCapture";
import { useCursorPosition } from "./hooks/useCursorPosition";
import { injectStyles } from "./utils/inject-styles";
import type { VoiceState, ConversationMessage } from "../core/types";

export interface CursorBuddyProviderProps {
  /** API endpoint for cursor buddy server */
  endpoint: string;
  /** Whether TTS is muted */
  muted?: boolean;
  /** Callback when transcript is ready */
  onTranscript?: (text: string) => void;
  /** Callback when AI responds */
  onResponse?: (text: string) => void;
  /** Callback when pointing at element */
  onPoint?: (target: { x: number; y: number; label: string }) => void;
  /** Callback when state changes */
  onStateChange?: (state: VoiceState) => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
  /** Children */
  children: React.ReactNode;
}

export function CursorBuddyProvider({
  endpoint,
  muted = false,
  onTranscript,
  onResponse,
  onPoint,
  onStateChange,
  onError,
  children,
}: CursorBuddyProviderProps) {
  const [snapshot, send] = useActor(cursorBuddyMachine);
  const voiceCapture = useVoiceCapture();
  const screenCapture = useScreenCapture();

  // Track cursor position
  useCursorPosition();

  // Inject styles on mount
  useEffect(() => {
    injectStyles();
  }, []);

  // Subscribe to atoms
  const audioLevel = useStore($audioLevel);
  const isEnabled = useStore($isEnabled);
  const isSpeaking = useStore($isSpeaking);
  const pointingTarget = useStore($pointingTarget);
  const cursorPosition = useStore($cursorPosition);

  // Local state
  const [isPointing, setIsPointing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelPointingRef = useRef<(() => void) | null>(null);
  // Track recording state via ref to avoid stale closure issues in callbacks
  const isRecordingRef = useRef(false);

  // Derive state from machine
  const state = snapshot.value as VoiceState;
  const transcript = snapshot.context.transcript;
  const response = snapshot.context.response;
  const error = snapshot.context.error;

  // Notify on state changes
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // Notify on errors
  useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error, onError]);

  // Update buddy position to follow cursor when idle
  useEffect(() => {
    if (state === "idle" && !isPointing) {
      $buddyPosition.set(cursorPosition);
      $buddyRotation.set(0);
      $buddyScale.set(1);
    }
  }, [state, isPointing, cursorPosition]);

  const startListening = useCallback(async () => {
    if (!isEnabled || isRecordingRef.current) return;

    try {
      isRecordingRef.current = true;
      send({ type: "HOTKEY_PRESSED" });
      await voiceCapture.start();
    } catch (err) {
      isRecordingRef.current = false;
      const captureError =
        err instanceof Error ? err : new Error("Failed to start recording");
      send({ type: "ERROR", error: captureError });
    }
  }, [isEnabled, send, voiceCapture]);

  const stopListening = useCallback(async () => {
    // Use ref instead of state to avoid stale closure issues
    if (!isRecordingRef.current) {
      return;
    }
    isRecordingRef.current = false;

    try {
      send({ type: "HOTKEY_RELEASED" });

      // Stop recording and get audio
      const audioBlob = await voiceCapture.stop();

      // Capture screenshot
      const screenshot = await screenCapture.capture();

      // Transcribe audio
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");

      const transcribeResponse = await fetch(`${endpoint}/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!transcribeResponse.ok) {
        throw new Error("Transcription failed");
      }

      const { text: transcriptText } = await transcribeResponse.json();
      send({ type: "TRANSCRIPTION_COMPLETE", transcript: transcriptText });
      onTranscript?.(transcriptText);

      // Get conversation history
      const history = $conversationHistory.get();

      // Send to AI
      const chatResponse = await fetch(`${endpoint}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          screenshot: screenshot.imageData,
          transcript: transcriptText,
          history,
        }),
      });

      if (!chatResponse.ok) {
        throw new Error("Chat request failed");
      }

      // Stream the response
      const reader = chatResponse.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullResponse += chunk;
        send({ type: "AI_RESPONSE_CHUNK", text: chunk });
      }

      // Parse pointing tag and strip from response
      const pointTarget = parsePointingTag(fullResponse);
      const cleanResponse = stripPointingTag(fullResponse);

      send({ type: "AI_RESPONSE_COMPLETE", response: cleanResponse });
      onResponse?.(cleanResponse);

      // Update conversation history
      const newHistory: ConversationMessage[] = [
        ...history,
        { role: "user", content: transcriptText },
        { role: "assistant", content: cleanResponse },
      ];
      $conversationHistory.set(newHistory);

      // Handle pointing if present
      if (pointTarget) {
        $pointingTarget.set(pointTarget);
        onPoint?.(pointTarget);
        handlePointing(pointTarget);
      }

      // Play TTS if not muted
      if (!muted && cleanResponse) {
        await playTTS(cleanResponse);
      }

      send({ type: "TTS_COMPLETE" });
    } catch (err) {
      const processError =
        err instanceof Error ? err : new Error("Processing failed");
      send({ type: "ERROR", error: processError });
    }
  }, [
    send,
    voiceCapture,
    screenCapture,
    endpoint,
    muted,
    onTranscript,
    onResponse,
    onPoint,
  ]);

  const handlePointing = useCallback(
    (target: { x: number; y: number; label: string }) => {
      setIsPointing(true);

      const startPos = $buddyPosition.get();
      const endPos = { x: target.x, y: target.y };

      cancelPointingRef.current = animateBezierFlight(startPos, endPos, 800, {
        onFrame: (position, rotation, scale) => {
          $buddyPosition.set(position);
          $buddyRotation.set(rotation);
          $buddyScale.set(scale);
        },
        onComplete: () => {
          setIsPointing(false);
          $buddyRotation.set(0);
          $buddyScale.set(1);
          send({ type: "POINTING_COMPLETE" });
        },
      });
    },
    [send],
  );

  const playTTS = useCallback(
    async (text: string) => {
      $isSpeaking.set(true);

      try {
        const response = await fetch(`${endpoint}/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) {
          throw new Error("TTS request failed");
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            reject(new Error("Audio playback failed"));
          };
          audio.play();
        });
      } finally {
        $isSpeaking.set(false);
        audioRef.current = null;
      }
    },
    [endpoint],
  );

  const speak = useCallback(
    async (text: string) => {
      if (muted) return;
      await playTTS(text);
    },
    [muted, playTTS],
  );

  const pointAt = useCallback(
    (x: number, y: number, label: string) => {
      const target = { x, y, label };
      $pointingTarget.set(target);
      handlePointing(target);
    },
    [handlePointing],
  );

  const setEnabled = useCallback((enabled: boolean) => {
    $isEnabled.set(enabled);
  }, []);

  const reset = useCallback(() => {
    // Cancel any ongoing pointing animation
    if (cancelPointingRef.current) {
      cancelPointingRef.current();
      cancelPointingRef.current = null;
    }

    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Reset recording state
    isRecordingRef.current = false;

    // Reset atoms
    $isSpeaking.set(false);
    $pointingTarget.set(null);
    setIsPointing(false);

    // Send cancel to machine
    send({ type: "CANCEL" });
  }, [send]);

  const contextValue: CursorBuddyContextValue = useMemo(
    () => ({
      state,
      transcript,
      response,
      audioLevel,
      isEnabled,
      isSpeaking,
      isPointing,
      error,
      startListening,
      stopListening,
      setEnabled,
      speak,
      pointAt,
      reset,
    }),
    [
      state,
      transcript,
      response,
      audioLevel,
      isEnabled,
      isSpeaking,
      isPointing,
      error,
      startListening,
      stopListening,
      setEnabled,
      speak,
      pointAt,
      reset,
    ],
  );

  return (
    <CursorBuddyContext.Provider value={contextValue}>
      {children}
    </CursorBuddyContext.Provider>
  );
}
