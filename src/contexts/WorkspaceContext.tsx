"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Workspace } from "@/lib/workspaces";

interface WorkspaceCtx {
  // Workspaces
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  switchWorkspace: (id: string) => void;
  refreshWorkspaces: () => Promise<void>;

  // Helper: pass workspace_id param to API calls
  wsParam: string;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWsId, setCurrentWsId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage
  useEffect(() => {
    const savedWs = localStorage.getItem("sequel-workspace");
    if (savedWs) setCurrentWsId(savedWs);
    setLoaded(true);
  }, []);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces");
      if (res.ok) {
        const data = await res.json();
        if (data.workspaces && data.workspaces.length > 0) {
          setWorkspaces(data.workspaces);
          return;
        }
      }
    } catch { /* fallback below */ }

    // Fallback: empty workspace list
    setWorkspaces([]);
  }, []);

  useEffect(() => {
    if (loaded) fetchWorkspaces();
  }, [loaded, fetchWorkspaces]);

  // Ensure currentWsId is valid
  useEffect(() => {
    if (workspaces.length > 0 && !workspaces.find((ws) => ws.id === currentWsId)) {
      const personal = workspaces.find((ws) => ws.type === "personal");
      const newId = personal?.id || workspaces[0].id;
      setCurrentWsId(newId);
      localStorage.setItem("sequel-workspace", newId);
    }
  }, [workspaces, currentWsId]);

  const switchWorkspace = useCallback((id: string) => {
    setCurrentWsId(id);
    localStorage.setItem("sequel-workspace", id);
  }, []);

  const currentWorkspace = workspaces.find((ws) => ws.id === currentWsId) || null;
  const wsParam = currentWsId ? `workspace_id=${currentWsId}` : "";

  return (
    <Ctx.Provider
      value={{
        workspaces,
        currentWorkspace,
        switchWorkspace,
        refreshWorkspaces: fetchWorkspaces,
        wsParam,
      }}
    >
      {loaded ? children : (
        <div className="flex items-center justify-center h-screen">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </Ctx.Provider>
  );
}
