"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  DEMO_USERS,
  DEMO_WORKSPACES,
  DEMO_MEMBERS,
  type Workspace,
  type DemoUser,
} from "@/lib/workspaces";

interface WorkspaceCtx {
  // Current user
  currentUser: DemoUser;
  setCurrentUser: (u: DemoUser) => void;
  allUsers: DemoUser[];

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
  const [currentUser, setCurrentUserState] = useState<DemoUser>(DEMO_USERS[0]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWsId, setCurrentWsId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem("sequel-user");
    const savedWs = localStorage.getItem("sequel-workspace");
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        const found = DEMO_USERS.find((du) => du.id === u.id);
        if (found) setCurrentUserState(found);
      } catch { /* */ }
    }
    if (savedWs) setCurrentWsId(savedWs);
    setLoaded(true);
  }, []);

  const setCurrentUser = useCallback((u: DemoUser) => {
    setCurrentUserState(u);
    localStorage.setItem("sequel-user", JSON.stringify(u));
    // Switch to user's personal workspace
    const personalWs = `ws-${u.id}`;
    setCurrentWsId(personalWs);
    localStorage.setItem("sequel-workspace", personalWs);
  }, []);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces?user_id=${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.workspaces && data.workspaces.length > 0) {
          setWorkspaces(data.workspaces);
          return;
        }
      }
    } catch { /* fallback below */ }

    // Fallback: use demo data filtered by user membership
    const memberWsIds = new Set(
      DEMO_MEMBERS.filter((m) => m.user_id === currentUser.id).map((m) => m.workspace_id)
    );
    const userWs = DEMO_WORKSPACES.filter((ws) => memberWsIds.has(ws.id)).map((ws) => ({
      ...ws,
      created_at: new Date().toISOString(),
    }));
    setWorkspaces(userWs);
  }, [currentUser.id]);

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
        currentUser,
        setCurrentUser,
        allUsers: DEMO_USERS,
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
