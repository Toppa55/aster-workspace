"use client";

import { Loader2, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const MAX_RECORDING_MS = 5 * 60 * 1000;

export function VoiceInput({
  disabled,
  onTranscript,
}: {
  disabled: boolean;
  onTranscript: (text: string) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">(
    "idle",
  );
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state !== "recording") return;
    const interval = window.setInterval(
      () => setSeconds((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(interval);
  }, [state]);

  useEffect(
    () => () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast.error(
        "Voice recording is not supported in this browser. Use the iPhone keyboard microphone instead.",
      );
      return;
    }
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      stream.current = audioStream;
      chunks.current = [];
      const mimeType = preferredMimeType();
      const mediaRecorder = new MediaRecorder(
        audioStream,
        mimeType ? { mimeType } : undefined,
      );
      recorder.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      mediaRecorder.onstop = () => void transcribe(mediaRecorder.mimeType);
      mediaRecorder.start(1000);
      setSeconds(0);
      setState("recording");
      stopTimer.current = setTimeout(
        () => mediaRecorder.stop(),
        MAX_RECORDING_MS,
      );
    } catch (error) {
      if ((error as Error).name === "NotAllowedError")
        toast.error("Allow microphone access to use voice input.");
      else
        toast.error(
          error instanceof Error ? error.message : "Could not start recording",
        );
    }
  };

  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  const transcribe = async (mimeType: string) => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    const blob = new Blob(chunks.current, { type: mimeType });
    chunks.current = [];
    if (!blob.size) {
      setState("idle");
      toast.error("No audio was captured");
      return;
    }
    setState("transcribing");
    try {
      const form = new FormData();
      form.set("audio", blob, fileNameFor(mimeType));
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as {
        text?: string;
        error?: string;
      };
      if (!response.ok || !result.text)
        throw new Error(result.error || "Transcription failed");
      onTranscript(result.text);
      toast.success("Voice added to your prompt");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Transcription failed",
      );
    } finally {
      setState("idle");
      setSeconds(0);
    }
  };

  if (state === "recording")
    return (
      <button
        type="button"
        onClick={stop}
        aria-label="Stop voice recording"
        className="flex h-9 items-center gap-2 rounded-xl bg-red-500 px-3 text-sm font-medium text-white shadow-sm"
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-70" />
          <span className="relative inline-flex size-2 rounded-full bg-white" />
        </span>
        {formatSeconds(seconds)}
        <Square className="size-3 fill-current" />
      </button>
    );

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled || state === "transcribing"}
      aria-label={
        state === "transcribing" ? "Transcribing voice" : "Start voice input"
      }
      title="Voice input"
      className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
    >
      {state === "transcribing" ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Mic className="size-4" />
      )}
    </button>
  );
}

function preferredMimeType() {
  const types = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mpeg",
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type));
}

function fileNameFor(mime: string) {
  if (mime.includes("mp4")) return "voice.m4a";
  if (mime.includes("mpeg")) return "voice.mp3";
  return "voice.webm";
}

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(value % 60).padStart(2, "0")}`;
}
