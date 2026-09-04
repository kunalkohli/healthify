import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Speech-to-text via the Web Speech API.
 *
 * Safari exposes this as webkitSpeechRecognition and it works on iOS, with two
 * quirks worth handling:
 *  1. It stops on its own after a pause, even with continuous = true, so we
 *     restart while the user still intends to be recording.
 *  2. Recognition must begin inside a user gesture.
 *
 * Deliberately does NOT auto-send. Dictated medical text mis-hears often
 * ("HbA1c" and "metformin" are not friendly to speech models), and silently
 * sending a garbled question to a health coach is a bad failure mode. The text
 * lands in the composer for review.
 */

type SR = any;

function getRecognition(): SR | null {
  const C =
    (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
  return C ? new C() : null;
}

/** iOS runs home-screen web apps in standalone mode, where WebKit often
 *  withholds SpeechRecognition even though Safari tabs have it. */
export function isStandalone(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true)
  );
}

export type SpeechState = {
  supported: boolean;
  listening: boolean;
  /** Words recognised but not yet finalised. */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
};

export function useSpeech(onFinal: (text: string) => void): SpeechState {
  const [supported] = useState(
    () => typeof window !== "undefined" && !!getRecognition(),
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rec = useRef<SR | null>(null);
  const wants = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => {
    wants.current = false;
    setListening(false);
    setInterim("");
    try {
      rec.current?.stop();
    } catch {
      /* already stopped */
    }
    rec.current = null;
  }, []);

  const start = useCallback(() => {
    if (!supported || wants.current) return;
    setError(null);

    const build = () => {
      const r = getRecognition();
      if (!r) return null;
      r.continuous = true;
      r.interimResults = true;
      r.lang = navigator.language || "en-US";

      r.onresult = (e: any) => {
        let pending = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) onFinalRef.current(res[0].transcript);
          else pending += res[0].transcript;
        }
        setInterim(pending);
      };

      r.onerror = (e: any) => {
        // "no-speech" and "aborted" are routine; don't nag about them.
        if (e.error === "no-speech" || e.error === "aborted") return;
        setError(
          e.error === "not-allowed"
            ? "Microphone access was denied. Enable it in Settings → Safari → Microphone."
            : `Speech error: ${e.error}`,
        );
        wants.current = false;
        setListening(false);
      };

      // Safari ends the session on silence; resume if the user hasn't stopped.
      r.onend = () => {
        setInterim("");
        if (!wants.current) {
          setListening(false);
          return;
        }
        try {
          rec.current = build();
          rec.current?.start();
        } catch {
          wants.current = false;
          setListening(false);
        }
      };
      return r;
    };

    try {
      wants.current = true;
      rec.current = build();
      rec.current?.start();
      setListening(true);
    } catch (e) {
      wants.current = false;
      setListening(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [supported]);

  // Release the mic if the component unmounts mid-recording.
  useEffect(() => stop, [stop]);

  return { supported, listening, interim, error, start, stop };
}
