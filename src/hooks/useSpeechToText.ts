/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface UseSpeechToTextOptions {
  /** Called continuously with interim + final transcript appended to base */
  onTranscript: (text: string) => void;
  /** The current value of the input — used as the base when recording starts */
  currentValue?: string;
  lang?: string;
  /**
   * Optional: called once when the user stops recording, with ONLY the
   * new raw transcript that was captured during this session (no base
   * text). Use this to pipe the fresh speech into a processing layer
   * (AI cleanup / command execution) without losing what the user had
   * already typed.
   */
  onSessionEnd?: (rawTranscript: string) => void;
}

export function useSpeechToText({
  onTranscript,
  currentValue = "",
  lang = "en-US",
  onSessionEnd,
}: UseSpeechToTextOptions) {
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef("");
  // Track the raw speech captured during this session so onSessionEnd
  // can hand it to a processing layer.
  const sessionRawRef = useRef("");

  useEffect(() => {
    const w = window as any;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
      return;
    }

    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;

    // Snapshot the current input value as our base
    baseTextRef.current = currentValue;
    sessionRawRef.current = "";

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      // The raw session transcript is only the FINAL text — interim
      // results are replaced on every tick, so we track only finals.
      sessionRawRef.current = final;
      const base = baseTextRef.current;
      const sep = base && !base.endsWith(" ") && !base.endsWith("\n") ? " " : "";
      onTranscript(base + sep + final + interim);
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      const raw = sessionRawRef.current.trim();
      if (raw && onSessionEnd) onSessionEnd(raw);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, currentValue, lang, onTranscript, onSessionEnd, stop]);

  return { isListening, supported, toggle, stop };
}
