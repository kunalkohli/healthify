import { useEffect, useState } from "react";
import type { ChatMessage, JournalEntry, MemoryFact, Profile } from "./core/schema/index.ts";
import {
  activeConfig,
  emptyProviderSettings,
  type ProviderSettings,
} from "./core/agent/providers/index.ts";
import type { LabUnitSystem, UnitSystem } from "./core/units.ts";
import type { Verbosity } from "./core/agent/prompts.ts";
import * as db from "./storage/db.ts";
import type { VaultMeta } from "./storage/crypto.ts";
import { Lock } from "./ui/Lock.tsx";
import { Onboarding } from "./ui/Onboarding.tsx";
import { Today } from "./ui/Today.tsx";
import { Risks } from "./ui/Risks.tsx";
import { Chat } from "./ui/Chat.tsx";
import { Settings } from "./ui/Settings.tsx";
import { IconCoach, IconRisks, IconToday, IconYou } from "./ui/icons.tsx";

type Tab = "today" | "risks" | "chat" | "settings";

const TABS: {
  id: Tab;
  label: string;
  Icon: (p: { size?: number }) => React.ReactElement;
}[] = [
  { id: "today", label: "Today", Icon: IconToday },
  { id: "risks", label: "Risks", Icon: IconRisks },
  { id: "chat", label: "Coach", Icon: IconCoach },
  { id: "settings", label: "You", Icon: IconYou },
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [vault, setVault] = useState<VaultMeta | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>("today");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [memories, setMemories] = useState<MemoryFact[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [providers, setProviders] = useState<ProviderSettings>(emptyProviderSettings());
  const [units, setUnits] = useState<UnitSystem>("metric");
  const [labUnits, setLabUnits] = useState<LabUnitSystem>("si");
  const [verbosity, setVerbosity] = useState<Verbosity>("brief");

  // Vault metadata is readable while locked; everything else is not.
  useEffect(() => {
    (async () => {
      setVault(await db.loadVaultMeta());
      setReady(true);
    })();
  }, []);

  const loadAll = async () => {
      const [p, m, j, c, cfg, u, lu, vb, done] = await Promise.all([
        db.loadProfile(),
        db.loadMemories(),
        db.loadJournal(),
        db.loadChat(),
        db.loadProviderSettings(),
        db.loadUnits(),
        db.loadLabUnits(),
        db.loadVerbosity(),
        db.loadOnboarded(),
      ]);
      setProfile(p);
      setMemories(m);
      setJournal(j);
      setMessages(c);
      setProviders(cfg);
      setUnits(u);
      setLabUnits(lu);
      setVerbosity(vb);
      setEditing(!done || !p);
      db.requestPersistence();
  };

  useEffect(() => {
    if (ready && unlocked && profile) db.saveProfile(profile);
  }, [profile, ready, unlocked]);
  useEffect(() => {
    if (ready && unlocked) db.saveMemories(memories);
  }, [memories, ready, unlocked]);
  useEffect(() => {
    if (ready && unlocked) db.saveJournal(journal);
  }, [journal, ready, unlocked]);
  useEffect(() => {
    if (ready && unlocked) db.saveChat(messages);
  }, [messages, ready, unlocked]);
  useEffect(() => {
    if (ready && unlocked) db.saveProviderSettings(providers);
  }, [providers, ready, unlocked]);
  useEffect(() => {
    if (ready && unlocked) db.saveUnits(units);
  }, [units, ready, unlocked]);
  useEffect(() => {
    if (ready && unlocked) db.saveLabUnits(labUnits);
  }, [labUnits, ready, unlocked]);
  useEffect(() => {
    if (ready && unlocked) db.saveVerbosity(verbosity);
  }, [verbosity, ready, unlocked]);

  // Re-lock when the app goes to the background so a handed-over unlocked
  // phone doesn't expose the vault.
  useEffect(() => {
    if (!unlocked || db.isPlaintextMode()) return;
    let since = 0;
    const onHide = () => {
      if (document.visibilityState === "hidden") since = Date.now();
      else if (since && Date.now() - since > 3 * 60_000) {
        db.lockVault();
        setUnlocked(false);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [unlocked]);

  if (!ready) {
    return <div className="h-full grid place-items-center text-[var(--color-muted)]">…</div>;
  }

  if (!unlocked) {
    return (
      <Lock
        meta={vault}
        onUnlocked={async () => {
          await loadAll();
          setVault(await db.loadVaultMeta());
          setUnlocked(true);
        }}
      />
    );
  }

  // Editing an existing profile must start from that profile, not a blank one.
  if (editing || !profile) {
    return (
      <Onboarding
        initial={profile}
        units={units}
        onUnits={setUnits}
        onCancel={profile ? () => setEditing(false) : undefined}
        onDone={async (p) => {
          setProfile(p);
          await db.saveProfile(p);
          await db.saveOnboarded(true);
          setEditing(false);
          setTab("risks");
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
        {tab === "today" && (
          <Today
            profile={profile}
            onProfile={setProfile}
            journal={journal}
            onJournal={setJournal}
            units={units}
            onUnits={setUnits}
            labUnits={labUnits}
            onLabUnits={setLabUnits}
            onGoChat={() => setTab("chat")}
          />
        )}
        {tab === "risks" && <Risks profile={profile} />}
        {tab === "chat" && (
          <Chat
            profile={profile}
            config={activeConfig(providers)}
            verbosity={verbosity}
            messages={messages}
            onMessages={setMessages}
            memories={memories}
            onMemories={setMemories}
            journal={journal}
            onJournal={setJournal}
          />
        )}
        {tab === "settings" && (
          <Settings
            vault={vault}
            onVault={setVault}
            onLock={() => {
              db.lockVault();
              setUnlocked(false);
            }}
            providers={providers}
            onProviders={setProviders}
            units={units}
            onUnits={setUnits}
            labUnits={labUnits}
            onLabUnits={setLabUnits}
            verbosity={verbosity}
            onVerbosity={setVerbosity}
            memories={memories}
            onMemories={setMemories}
            profile={profile}
            onEditProfile={() => setEditing(true)}
            onReset={async () => {
              await db.destroyVault();
              location.reload();
            }}
          />
        )}
      </div>
      <Nav tab={tab} setTab={setTab} floating={tab === "chat"} />
    </div>
  );
}

function Nav({
  tab,
  setTab,
  floating,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  floating?: boolean;
}) {
  return (
    <nav
      className={`shrink-0 border-t border-[var(--color-line)] bg-white pb-safe z-50 ${
        floating ? "" : "fixed bottom-0 left-0 right-0"
      }`}
    >
      <div className="flex">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 pt-2 pb-1 flex flex-col items-center gap-1 transition-colors ${
              tab === id ? "text-[var(--color-accent-ink)]" : "text-[var(--color-muted)]"
            }`}
          >
            <Icon size={22} />
            <span className={`text-[11px] leading-none ${tab === id ? "font-semibold" : ""}`}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
