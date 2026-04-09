"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SkillIcon from "@/components/skills/SkillIcon";
import SkillChat from "@/components/skills/SkillChat";
import {
  SKILLS,
  SKILL_CATEGORIES,
  QUICK_INSTALL_BUNDLES,
  BRAIN_CONTEXT_LABELS,
  type Skill,
  type BrainContextType,
} from "@/lib/skills";

type ContextStatus = Record<BrainContextType, boolean>;
type InstalledRow = { skill_name: string; setup_answers: Record<string, string> };
type View =
  | { type: "browse" }
  | { type: "detail"; skill: Skill }
  | { type: "setup"; skill: Skill }
  | { type: "installed"; skill: Skill };

export default function SkillsPage() {
  const [view, setView] = useState<View>({ type: "browse" });
  const [tab, setTab] = useState<"marketplace" | "installed">("marketplace");
  const [category, setCategory] = useState<string>("all");
  const [contextStatus, setContextStatus] = useState<ContextStatus | null>(null);
  const [installed, setInstalled] = useState<InstalledRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ctxRes, insRes] = await Promise.all([
        fetch("/api/skills/brain-context"),
        fetch("/api/skills/installed"),
      ]);
      if (ctxRes.ok) {
        const j = await ctxRes.json();
        setContextStatus(j.status);
      }
      if (insRes.ok) {
        const j = await insRes.json();
        setInstalled(j.installed || []);
      }
    } catch (err) {
      console.error("[Skills] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const installedNames = useMemo(
    () => new Set(installed.map((i) => i.skill_name)),
    [installed]
  );

  const visibleSkills = useMemo(() => {
    let list = [...SKILLS].sort((a, b) => a.priority - b.priority);
    if (tab === "installed") {
      list = list.filter((s) => installedNames.has(s.name));
    } else if (category === "ready") {
      list = list.filter((s) => s.status === "ready");
    } else if (category !== "all") {
      list = list.filter((s) => s.category === category);
    }
    return list;
  }, [tab, category, installedNames]);

  async function handleInstall(skill: Skill, answers: Record<string, string>) {
    try {
      const res = await fetch("/api/skills/installed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_name: skill.name, setup_answers: answers }),
      });
      if (!res.ok) throw new Error("Install failed");
      await loadData();
      setView({ type: "browse" });
      setTab("installed");
    } catch (err) {
      console.error(err);
      alert("Failed to install skill.");
    }
  }

  async function handleUninstall(skillName: string) {
    if (!confirm("Uninstall this skill?")) return;
    try {
      await fetch(`/api/skills/installed?skill_name=${skillName}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      console.error(err);
    }
  }

  // ── Render views ──
  if (view.type === "installed") {
    return (
      <SkillChat
        skill={view.skill}
        onBack={() => setView({ type: "browse" })}
        onUninstall={() => {
          handleUninstall(view.skill.name);
          setView({ type: "browse" });
        }}
      />
    );
  }

  if (view.type === "setup") {
    return (
      <SetupInterview
        skill={view.skill}
        onCancel={() => setView({ type: "detail", skill: view.skill })}
        onComplete={(answers) => handleInstall(view.skill, answers)}
      />
    );
  }

  if (view.type === "detail") {
    return (
      <SkillDetail
        skill={view.skill}
        contextStatus={contextStatus}
        isInstalled={installedNames.has(view.skill.name)}
        onBack={() => setView({ type: "browse" })}
        onInstall={() => setView({ type: "setup", skill: view.skill })}
        onOpen={() => setView({ type: "installed", skill: view.skill })}
      />
    );
  }

  // Browse view
  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-heading">Skills</h1>
        <p className="mt-1 text-sm text-body">
          Add tools to your workspace — each one connects to your Brand Brain automatically
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border mb-6">
        <button
          onClick={() => setTab("marketplace")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "marketplace"
              ? "border-brand-500 text-heading"
              : "border-transparent text-body hover:text-heading"
          }`}
        >
          Marketplace
        </button>
        <button
          onClick={() => setTab("installed")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "installed"
              ? "border-brand-500 text-heading"
              : "border-transparent text-body hover:text-heading"
          }`}
        >
          Installed
          {installed.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-brand-100 text-brand-700">
              {installed.length}
            </span>
          )}
        </button>
      </div>

      {/* Quick Install Bundles */}
      {tab === "marketplace" && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            Quick Install Bundles
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {QUICK_INSTALL_BUNDLES.map((bundle) => (
              <div
                key={bundle.id}
                className="p-4 bg-surface-card border border-border rounded-card shadow-card hover:shadow-card-hover transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-heading">{bundle.name}</h3>
                  <span className="text-[10px] text-muted">{bundle.setupTime}</span>
                </div>
                <p className="text-xs text-body mb-3">{bundle.tagline}</p>
                <button
                  disabled
                  className="text-xs font-medium text-brand-500 opacity-50 cursor-not-allowed"
                  title="Install individual skills for now"
                >
                  Install bundle →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category pills */}
      {tab === "marketplace" && (
        <div className="flex items-center gap-2 flex-wrap mb-6">
          {SKILL_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                category === cat.id
                  ? "bg-brand-500 text-white"
                  : "bg-surface-raised text-body hover:bg-brand-100 hover:text-brand-700"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Skill list */}
      {loading ? (
        <div className="text-center py-16 text-muted text-sm">Loading skills...</div>
      ) : visibleSkills.length === 0 ? (
        <div className="text-center py-16 text-muted text-sm">
          {tab === "installed" ? "No skills installed yet." : "No skills in this category."}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleSkills.map((skill) => (
            <SkillCard
              key={skill.name}
              skill={skill}
              contextStatus={contextStatus}
              isInstalled={installedNames.has(skill.name)}
              onClick={() => {
                if (skill.status === "planned") return;
                if (installedNames.has(skill.name)) {
                  setView({ type: "installed", skill });
                } else {
                  setView({ type: "detail", skill });
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Subcomponents ──

function SkillCard({
  skill,
  contextStatus,
  isInstalled,
  onClick,
}: {
  skill: Skill;
  contextStatus: ContextStatus | null;
  isInstalled: boolean;
  onClick: () => void;
}) {
  const isPlanned = skill.status === "planned";
  return (
    <button
      onClick={onClick}
      disabled={isPlanned}
      className={`w-full text-left p-4 bg-surface-card border border-border rounded-card shadow-card transition-all ${
        isPlanned ? "opacity-50 cursor-not-allowed" : "hover:shadow-card-hover hover:border-brand-200"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
          <SkillIcon name={skill.icon} className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-sm font-semibold text-heading">{skill.displayName}</h3>
            <span className="text-[10px] text-muted uppercase tracking-wider">{skill.category}</span>
            {isPlanned && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-raised text-muted">
                Coming soon
              </span>
            )}
            {isInstalled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                Installed
              </span>
            )}
          </div>
          <p className="text-sm text-body mb-3">{skill.tagline}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {skill.contextRequired.map((ctx) => {
              const loaded = contextStatus?.[ctx] ?? false;
              return (
                <span
                  key={ctx}
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-surface-raised text-body"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${loaded ? "bg-green-500" : "bg-orange-500"}`}
                  />
                  {BRAIN_CONTEXT_LABELS[ctx]}
                </span>
              );
            })}
          </div>
        </div>
        {!isPlanned && (
          <div className="text-muted shrink-0 mt-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        )}
      </div>
    </button>
  );
}

function SkillDetail({
  skill,
  contextStatus,
  isInstalled,
  onBack,
  onInstall,
  onOpen,
}: {
  skill: Skill;
  contextStatus: ContextStatus | null;
  isInstalled: boolean;
  onBack: () => void;
  onInstall: () => void;
  onOpen: () => void;
}) {
  const missingRequired = skill.contextRequired.filter((ctx) => !(contextStatus?.[ctx] ?? false));
  const canInstall = missingRequired.length === 0;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-body hover:text-heading mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Back to marketplace
      </button>

      {/* Header */}
      <div className="flex items-start gap-5 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
          <SkillIcon name={skill.icon} className="w-8 h-8" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-semibold text-heading">{skill.displayName}</h1>
            <span className="text-xs text-muted uppercase tracking-wider">{skill.category}</span>
          </div>
          <p className="text-sm text-body">{skill.tagline}</p>
        </div>
        {isInstalled ? (
          <button
            onClick={onOpen}
            className="px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 transition-colors shadow-sm"
          >
            Open →
          </button>
        ) : (
          <button
            onClick={onInstall}
            disabled={!canInstall}
            className={`px-4 py-2.5 text-sm font-medium rounded-xl transition-colors shadow-sm ${
              canInstall
                ? "text-white bg-brand-500 hover:bg-brand-600"
                : "text-muted bg-surface-raised cursor-not-allowed"
            }`}
          >
            {canInstall ? `Install · ${skill.setupTime}` : "Missing Context"}
          </button>
        )}
      </div>

      {/* Warning */}
      {!canInstall && (
        <div className="mb-6 p-4 rounded-card border border-orange-200 bg-orange-50">
          <p className="text-sm font-medium text-orange-900 mb-1">Missing Brand Brain context</p>
          <p className="text-xs text-orange-800">
            This skill needs the following docs in your Brand Brain before it can be installed:{" "}
            {missingRequired.map((c) => BRAIN_CONTEXT_LABELS[c]).join(", ")}. Add them in the{" "}
            <a href="/brain" className="underline font-medium">
              Brain
            </a>{" "}
            tab.
          </p>
        </div>
      )}

      {/* Brand Brain Context */}
      <Section title="Brand Brain Context">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Required</p>
            <div className="space-y-1.5">
              {skill.contextRequired.map((ctx) => (
                <ContextRow key={ctx} label={BRAIN_CONTEXT_LABELS[ctx]} loaded={contextStatus?.[ctx] ?? false} />
              ))}
            </div>
          </div>
          {skill.contextOptional.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Optional</p>
              <div className="space-y-1.5">
                {skill.contextOptional.map((ctx) => (
                  <ContextRow
                    key={ctx}
                    label={BRAIN_CONTEXT_LABELS[ctx]}
                    loaded={contextStatus?.[ctx] ?? false}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Workflows */}
      <Section title="Workflows">
        <ol className="space-y-2">
          {skill.workflows.map((w, i) => (
            <li key={w} className="flex items-start gap-3 text-sm text-body">
              <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 text-xs font-semibold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              {w}
            </li>
          ))}
        </ol>
      </Section>

      {/* Outputs */}
      <Section title="Outputs">
        <div className="flex flex-wrap gap-2">
          {skill.outputs.map((o) => (
            <span
              key={o}
              className="text-xs px-2.5 py-1 rounded-full bg-surface-raised text-body border border-border-light"
            >
              {o}
            </span>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 p-5 bg-surface-card border border-border rounded-card shadow-card">
      <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">{title}</h2>
      {children}
    </div>
  );
}

function ContextRow({ label, loaded }: { label: string; loaded: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`w-2 h-2 rounded-full ${loaded ? "bg-green-500" : "bg-orange-500"}`} />
      <span className="text-body">{label}</span>
      <span className={`text-[10px] ml-auto ${loaded ? "text-green-700" : "text-orange-700"}`}>
        {loaded ? "Loaded" : "Not loaded"}
      </span>
    </div>
  );
}

function SetupInterview({
  skill,
  onCancel,
  onComplete,
}: {
  skill: Skill;
  onCancel: () => void;
  onComplete: (answers: Record<string, string>) => void;
}) {
  const questions = skill.setupQuestions;
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [textInput, setTextInput] = useState("");

  // If skill has no setup questions, install immediately
  useEffect(() => {
    if (questions.length === 0) {
      onComplete({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (questions.length === 0) {
    return <div className="p-8 text-center text-muted text-sm">Installing...</div>;
  }

  const current = questions[idx];
  const total = questions.length;

  function advance(value: string) {
    const next = { ...answers, [current.id]: value };
    setAnswers(next);
    setTextInput("");
    if (idx + 1 >= total) {
      onComplete(next);
    } else {
      setIdx(idx + 1);
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <button
        onClick={onCancel}
        className="flex items-center gap-1.5 text-sm text-body hover:text-heading mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Cancel setup
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center">
          <SkillIcon name={skill.icon} className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-heading">{skill.displayName}</h2>
          <p className="text-xs text-muted">Quick setup</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs text-muted mb-1.5">
          <span>
            Question {idx + 1} of {total}
          </span>
          <span>{Math.round(((idx + 1) / total) * 100)}%</span>
        </div>
        <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 transition-all duration-300"
            style={{ width: `${((idx + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="p-6 bg-surface-card border border-border rounded-card shadow-card">
        <p className="text-base font-semibold text-heading mb-5">{current.q}</p>

        {current.options ? (
          <div className="space-y-2">
            {current.options.map((opt) => (
              <button
                key={opt}
                onClick={() => advance(opt)}
                className="w-full text-left px-4 py-3 text-sm text-body bg-surface-raised hover:bg-brand-100 hover:text-brand-700 rounded-lg border border-border-light hover:border-brand-300 transition-colors"
              >
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              rows={4}
              placeholder="Type your answer..."
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
            />
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => advance(textInput.trim())}
                disabled={!textInput.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:bg-surface-raised disabled:text-muted transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
