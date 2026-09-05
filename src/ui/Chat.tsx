import { useEffect, useRef, useState } from "react";
import {
  uid,
  type ChatMessage,
  type CoachPlan,
  type JournalEntry,
  type MemoryFact,
  type Profile,
} from "../core/schema/index.ts";
import { snapshot } from "../core/risk/index.ts";
import {
  familyHistoryDoc,
  memoryDoc,
  planDoc,
  profileDoc,
  riskDoc,
} from "../core/context/generate.ts";
import {
  MEMORY_EXTRACTION_PROMPT,
  VERBOSITY_MAX_TOKENS,
  systemPrompt,
  type Verbosity,
} from "../core/agent/prompts.ts";
import { chat, extractMemories } from "../core/agent/loop.ts";
import {
  configProblem,
  getProvider,
  type ProviderConfig,
} from "../core/agent/providers/index.ts";
import { Button, Empty } from "./primitives.tsx";
import { IconMic, IconSend, IconStop } from "./icons.tsx";
import { isStandalone, useSpeech } from "./useSpeech.ts";
import { Markdown } from "./Markdown.tsx";

/** How many stored messages to replay into a resumed conversation. */
const RECENT_TURNS = 12;

const SUGGESTIONS = [
  "What should I eat this week to lower my diabetes risk?",
  "Explain my family history flags in plain terms",
  "What's the single highest-leverage change I can make?",
  "Which tests should I ask my doctor for, and why?",
];

export function Chat({
  profile,
  config,
  verbosity,
  plan,
  onPlan,
  retentionDays,
  messages,
  onMessages,
  memories,
  onMemories,
  journal,
  onJournal,
}: {
  profile: Profile;
  config: ProviderConfig;
  verbosity: Verbosity;
  plan: CoachPlan | null;
  onPlan: (p: CoachPlan) => void;
  retentionDays: number;
  messages: ChatMessage[];
  onMessages: (m: ChatMessage[]) => void;
  memories: MemoryFact[];
  onMemories: (m: MemoryFact[]) => void;
  journal: JournalEntry[];
  onJournal: (j: JournalEntry[]) => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolTrace, setToolTrace] = useState<string[]>([]);

  // Dictated speech is appended to whatever is already typed, so you can mix
  // voice and keyboard freely.
  const [micHint, setMicHint] = useState(false);
  const speech = useSpeech((finalText) =>
    setInput((prev) => (prev ? `${prev.replace(/\s+$/, "")} ${finalText.trim()}` : finalText.trim())),
  );
  const scroller = useRef<HTMLDivElement>(null);

  // Provider-native history (with tool blocks) kept separate from what we render.
  const history = useRef<any[]>([]);

  /**
   * Switching tabs unmounts this component and used to wipe the ref, so the
   * model forgot a conversation that was still on screen. Rebuild a plain
   * text history from the rendered messages on mount. Tool blocks are dropped
   * — they can't be reconstructed and the model doesn't need them, only the
   * conversational thread.
   */
  const seeded = useRef(false);
  if (!seeded.current) {
    seeded.current = true;
    history.current = getProvider(config.provider).seedHistory(
      messages.slice(-RECENT_TURNS).map((m) => ({ role: m.role, content: m.content })),
    );
  }

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, toolTrace]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const problem = configProblem(config);
    if (problem) {
      setError(`${problem} Open the You tab to set it up.`);
      return;
    }
    setError(null);
    setInput("");
    setToolTrace([]);

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const next = [...messages, userMsg];
    onMessages(next);
    setBusy(true);

    // Fresh context every turn — the docs are cheap and always current.
    const s = snapshot(profile);
    const system = systemPrompt({
      profileDoc: profileDoc(profile),
      familyDoc: familyHistoryDoc(profile),
      riskDoc: riskDoc(s),
      memoryDoc: memoryDoc(memories),
      planDoc: planDoc(plan),
      today: new Date().toISOString().slice(0, 10),
      verbosity,
    });

    const pendingMemories: MemoryFact[] = [];
    const pendingJournal: JournalEntry[] = [];

    try {
      const res = await chat({
        config,
        system,
        history: history.current,
        userText: text,
        maxTokens: VERBOSITY_MAX_TOKENS[verbosity],
        onToolCall: (name) => setToolTrace((t) => [...t, name]),
        toolContext: {
          profile,
          journal,
          setPlan: (p) => onPlan(p),
          addMemory: (t, c) =>
            pendingMemories.push({
              id: uid(),
              text: t,
              category: c,
              createdAt: new Date().toISOString(),
              sourceSessionId: null,
              approved: false,
            }),
          addJournal: (e) =>
            pendingJournal.push({ ...e, id: uid(), createdAt: new Date().toISOString() }),
        },
      });

      history.current = res.history;

      onMessages([
        ...next,
        {
          id: uid(),
          role: "assistant",
          content: res.text,
          createdAt: new Date().toISOString(),
        },
      ]);

      if (pendingMemories.length) onMemories([...memories, ...pendingMemories]);
      if (pendingJournal.length) onJournal([...journal, ...pendingJournal]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setToolTrace([]);
    }
  }

  /** Distil durable facts from the session, queued for approval. */
  async function distil() {
    if (configProblem(config) || messages.length < 2) return;
    setBusy(true);
    try {
      const transcript = messages
        .map((m) => `${m.role === "user" ? "Client" : "Coach"}: ${m.content}`)
        .join("\n\n");
      const facts = await extractMemories(config, transcript, MEMORY_EXTRACTION_PROMPT);
      const known = new Set(memories.map((m) => m.text.toLowerCase()));
      const fresh = facts
        .filter((f) => f.text && !known.has(f.text.toLowerCase()))
        .map((f) => ({
          id: uid(),
          text: f.text,
          category: (f.category ?? "context") as MemoryFact["category"],
          createdAt: new Date().toISOString(),
          sourceSessionId: null,
          approved: false,
        }));
      if (fresh.length) onMemories([...memories, ...fresh]);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Distil on the way out of a substantial conversation, so remembering
   * doesn't depend on noticing a button. Still only *proposes* — nothing is
   * stored until it's approved.
   */
  const distilled = useRef(false);
  useEffect(() => {
    return () => {
      if (distilled.current) return;
      if (messages.length < 6) return;
      if (configProblem(config)) return;
      distilled.current = true;
      void distil();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, config]);

  const pending = memories.filter((m) => !m.approved);

  return (
    <div className="flex flex-col h-full">
      <div ref={scroller} className="flex-1 overflow-y-auto px-5 safe-top">
        <div className="pt-6 pb-2">
          <h1 className="text-[28px] font-semibold tracking-tight">Coach</h1>
          <p className="text-[14px] text-[var(--color-muted)] mt-1">
            Knows your profile, family history, and computed risks.
            {retentionDays > 0 && (
              <>
                {" "}
                Messages older than {retentionDays === 1 ? "a day" : `${retentionDays} days`} are
                cleared — what mattered is kept as facts and your plan.
              </>
            )}
          </p>
        </div>

        {pending.length > 0 && (
          <div className="rounded-2xl border border-green-200 bg-[var(--color-accent-soft)] p-4 my-4">
            <div className="text-[14px] font-medium mb-1">
              {pending.length} new thing{pending.length > 1 ? "s" : ""} I picked up
            </div>
            <p className="text-[13px] text-[var(--color-muted)] mb-3">
              Approve these and I'll remember them. Wrong facts persist, so check them.
            </p>
            {pending.map((m) => (
              <div key={m.id} className="flex items-start gap-2 mb-2">
                <span className="flex-1 text-[14px] leading-snug">{m.text}</span>
                <button
                  onClick={() =>
                    onMemories(
                      memories.map((x) => (x.id === m.id ? { ...x, approved: true } : x)),
                    )
                  }
                  className="text-[var(--color-accent-ink)] text-[13px] px-2 font-medium"
                >
                  Keep
                </button>
                <button
                  onClick={() => onMemories(memories.filter((x) => x.id !== m.id))}
                  className="text-[var(--color-muted)] text-[13px] px-1"
                >
                  Drop
                </button>
              </div>
            ))}
          </div>
        )}

        {messages.length === 0 && (
          <div className="pt-4">
            <Empty>Ask me anything about your health.</Empty>
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left rounded-xl bg-white border border-[var(--color-line)] px-4 py-3 text-[15px] active:bg-[var(--color-surface)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`my-3 ${m.role === "user" ? "flex justify-end" : ""}`}>
            {m.role === "user" ? (
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--color-accent)] text-white px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
                {m.content}
              </div>
            ) : (
              <div className="text-[15px] leading-relaxed">
                <Markdown text={m.content} />
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="my-4">
            <div className="flex gap-1.5 items-center">
              <span className="dot w-1.5 h-1.5 rounded-full bg-[var(--color-muted)]" />
              <span className="dot w-1.5 h-1.5 rounded-full bg-[var(--color-muted)]" />
              <span className="dot w-1.5 h-1.5 rounded-full bg-[var(--color-muted)]" />
            </div>
            {toolTrace.length > 0 && (
              <div className="text-[12px] text-[var(--color-muted)] mt-2 font-mono">
                {toolTrace.join(" → ")}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="my-3 rounded-xl border border-red-200 bg-[var(--color-danger-soft)] px-4 py-3 text-[14px] text-[var(--color-danger)] leading-relaxed whitespace-pre-wrap">
            {error}
          </div>
        )}

        {messages.length >= 4 && !busy && (
          <div className="my-6">
            <Button variant="ghost" onClick={distil}>
              Save what you learned about me
            </Button>
          </div>
        )}

        <div className="h-4" />
      </div>

      <div className="px-5 pt-2 pb-safe border-t border-[var(--color-line)] bg-white">
        {speech.listening && (
          <div className="flex items-center gap-2 pb-2 text-[13px] text-[var(--color-danger)]">
            <span className="w-2 h-2 rounded-full bg-[var(--color-danger)] dot" />
            <span>{speech.interim || "Listening…"}</span>
          </div>
        )}
        {speech.error && (
          <div className="pb-2 text-[13px] text-[var(--color-danger)] leading-snug">
            {speech.error}
          </div>
        )}
        {micHint && !speech.supported && (
          <div className="pb-2 text-[13px] text-[var(--color-muted)] leading-relaxed">
            {isStandalone()
              ? "iOS doesn't give home-screen apps in-app dictation. Tap the message box and use the microphone on the keyboard instead — same result. Opening the site in a Safari tab enables this button."
              : "This browser doesn't support in-app dictation. On iPhone, tap the message box and use the keyboard's microphone."}
          </div>
        )}
        <div className="flex gap-2 items-end">
          {
            <button
              onClick={() => {
                if (!speech.supported) return setMicHint(!micHint);
                speech.listening ? speech.stop() : speech.start();
              }}
              disabled={busy}
              aria-label={speech.listening ? "Stop dictation" : "Dictate"}
              className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center border transition-colors disabled:opacity-30 ${
                speech.listening
                  ? "bg-[var(--color-danger)] text-white border-[var(--color-danger)]"
                  : "bg-white text-[var(--color-muted)] border-[var(--color-line)]"
              }`}
            >
              {speech.listening ? <IconStop /> : <IconMic />}
            </button>
          }
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={speech.listening ? "Speak…" : "Ask anything…"}
            className="flex-1 resize-none rounded-2xl bg-[var(--color-surface)] border border-[var(--color-line)] px-4 py-3 outline-none focus:border-[var(--color-accent)] focus:bg-white max-h-32"
          />
          <button
            onClick={() => {
              speech.stop();
              send(input);
            }}
            disabled={busy || !input.trim()}
            className="shrink-0 w-11 h-11 rounded-full bg-[var(--color-accent)] text-white disabled:opacity-30 flex items-center justify-center"
            aria-label="Send"
          >
            <IconSend />
          </button>
        </div>
      </div>
    </div>
  );
}
