import { useCallback, useRef, useState } from "react";
import { createWorkletBlobURL } from "../utils/audio-worklet";
import { mergeAudioChunks, encodeWAV } from "../utils/audio";
import { $audioLevel } from "../../core/atoms";

const SAMPLE_RATE = 16000;
const AUDIO_LEVEL_BOOST = 10.2;

export interface UseVoiceCaptureReturn {
  /** Start recording audio */
  start: () => Promise<void>;
  /** Stop recording and return WAV blob */
  stop: () => Promise<Blob>;
  /** Whether currently recording */
  isRecording: boolean;
  /** Last error (null if none) */
  error: Error | null;
}

/**
 * Hook for voice capture using AudioWorkletNode.
 * Updates $audioLevel atom for waveform visualization.
 */
export function useVoiceCapture(): UseVoiceCaptureReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  const start = useCallback(async () => {
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioContext;

      // Load worklet from blob URL
      const workletURL = createWorkletBlobURL();
      await audioContext.audioWorklet.addModule(workletURL);

      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(
        audioContext,
        "audio-capture-processor",
      );
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        const { type, data, rms } = event.data;

        if (type === "audio") {
          chunksRef.current.push(data);
        } else if (type === "level") {
          // Boost audio level for better visualization
          const boostedLevel = Math.min(rms * AUDIO_LEVEL_BOOST, 1);
          $audioLevel.set(boostedLevel);
        }
      };

      source.connect(workletNode);
      // Don't connect to destination - we don't want to play back the mic

      setIsRecording(true);
    } catch (err) {
      const captureError =
        err instanceof Error ? err : new Error("Microphone access failed");
      setError(captureError);
      throw captureError;
    }
  }, []);

  const stop = useCallback(async (): Promise<Blob> => {
    // Stop the media stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Disconnect and close audio nodes
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Reset audio level
    $audioLevel.set(0);

    // Encode captured audio as WAV
    const audioData = mergeAudioChunks(chunksRef.current);
    const wavBlob = encodeWAV(audioData, SAMPLE_RATE);

    chunksRef.current = [];
    setIsRecording(false);

    return wavBlob;
  }, []);

  return { start, stop, isRecording, error };
}
