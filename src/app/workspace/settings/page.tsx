"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/contexts/WorkspaceContext";

const ICONS = ["🏠", "📣", "💼", "🎯", "🚀", "⚡", "🧠", "🌐", "🎨", "📊", "🔬", "💡"];
const COLORS = ["#7C3AED", "#EC4899", "#8B5CF6", "#059669", "#6366F1", "#DC2626", "#F59E0B", "#0EA5E9", "#14B8A6"];

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const { currentUser, allUsers, currentWorkspace, refreshWorkspaces } = useWorkspace();

  const [mode, setMode] = useState<"view" | "create" | "edit">(currentWorkspace ? "view" : "create");
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏠");
  const [color, setColor] = useState("#7C3AED");
  const [type, setType] = useState<"personal" | "team">("team");
  const [members, setMembers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function startCreate() {
    setMode("create");
    setName("");
    setIcon("🏠");
    setColor("#7C3AED");
    setType("team");
    setMembers([]);
  }

  function startEdit() {
    if (!currentWorkspace) return;
    setMode("edit");
    setName(currentWorkspace.name);
    setIcon(currentWorkspace.icon);
    setColor(currentWorkspace.color);
    setType(currentWorkspace.type);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        icon, color, type,
        created_by: currentUser.id,
        members: type === "team" ? members : [],
      };
      if (mode === "edit" && currentWorkspace) {
        body.id = currentWorkspace.id;
      }

      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await refreshWorkspaces();
        setMode("view");
      }
    } catch { /* */ }
    setSaving(false);
  }

  async function handleDelete() {
    if (!currentWorkspace || currentWorkspace.type === "personal") return;
    if (!confirm(`Delete "${currentWorkspace.name}"? This cannot be undone.`)) return;

    await fetch(`/api/workspaces?id=${currentWorkspace.id}`, { method: "DELETE" });
    await refreshWorkspaces();
    router.push("/chat");
  }

  function toggleMember(uid: string) {
    setMembers((prev) =>
      prev.includes(uid) ? prev.filter((m) => m !== uid) : [...prev, uid]
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-body hover:text-heading mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back
      </button>

      {mode === "view" && currentWorkspace ? (
        <>
          <div className="flex items-center gap-4 mb-8">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
              style={{ backgroundColor: currentWorkspace.color }}
            >
              {currentWorkspace.icon}
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-heading">{currentWorkspace.name}</h1>
              <p className="text-sm text-body capitalize">{currentWorkspace.type} workspace</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3">
              <button
                onClick={startEdit}
                className="px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 transition-colors"
              >
                Edit Workspace
              </button>
              <button
                onClick={startCreate}
                className="px-5 py-2.5 text-sm font-medium text-brand-600 bg-brand-50 rounded-xl hover:bg-brand-100 transition-colors"
              >
                + Create New
              </button>
              {currentWorkspace.type === "team" && (
                <button
                  onClick={handleDelete}
                  className="px-5 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-heading mb-2">
            {mode === "create" ? "Create Workspace" : "Edit Workspace"}
          </h1>
          <p className="text-sm text-body mb-6">
            {mode === "create" ? "Set up a new workspace for yourself or your team." : "Update workspace settings."}
          </p>

          <div className="space-y-6">
            {/* Name */}
            <div>
              <label className="text-sm font-medium text-heading block mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                placeholder="Marketing Team"
              />
            </div>

            {/* Icon */}
            <div>
              <label className="text-sm font-medium text-heading block mb-1.5">Icon</label>
              <div className="flex flex-wrap gap-2">
                {ICONS.map((ic) => (
                  <button
                    key={ic}
                    onClick={() => setIcon(ic)}
                    className={`w-10 h-10 rounded-lg border text-lg flex items-center justify-center transition-colors ${
                      icon === ic ? "border-brand-400 bg-brand-50" : "border-border hover:border-brand-200"
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div>
              <label className="text-sm font-medium text-heading block mb-1.5">Color</label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full transition-all ${
                      color === c ? "ring-2 ring-offset-2 ring-brand-400 scale-110" : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Type */}
            {mode === "create" && (
              <div>
                <label className="text-sm font-medium text-heading block mb-1.5">Type</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setType("personal")}
                    className={`flex-1 p-4 rounded-xl border text-left transition-colors ${
                      type === "personal" ? "border-brand-400 bg-brand-50" : "border-border hover:border-brand-200"
                    }`}
                  >
                    <p className="text-sm font-semibold text-heading">Just Me</p>
                    <p className="text-xs text-body mt-0.5">Personal workspace</p>
                  </button>
                  <button
                    onClick={() => setType("team")}
                    className={`flex-1 p-4 rounded-xl border text-left transition-colors ${
                      type === "team" ? "border-brand-400 bg-brand-50" : "border-border hover:border-brand-200"
                    }`}
                  >
                    <p className="text-sm font-semibold text-heading">Team</p>
                    <p className="text-xs text-body mt-0.5">Shared with members</p>
                  </button>
                </div>
              </div>
            )}

            {/* Members */}
            {type === "team" && (
              <div>
                <label className="text-sm font-medium text-heading block mb-1.5">Members</label>
                <div className="space-y-2">
                  {allUsers.filter((u) => u.id !== currentUser.id).map((u) => (
                    <button
                      key={u.id}
                      onClick={() => toggleMember(u.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                        members.includes(u.id) ? "border-brand-400 bg-brand-50" : "border-border hover:border-brand-200"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-semibold">
                        {u.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-heading">{u.name}</p>
                        <p className="text-xs text-body">{u.role}</p>
                      </div>
                      {members.includes(u.id) && (
                        <svg className="w-5 h-5 text-brand-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleSave}
                disabled={!name.trim() || saving}
                className="px-6 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors"
              >
                {saving ? "Saving..." : mode === "create" ? "Create Workspace" : "Save Changes"}
              </button>
              <button
                onClick={() => setMode("view")}
                className="px-6 py-2.5 text-sm font-medium text-body hover:text-heading transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
