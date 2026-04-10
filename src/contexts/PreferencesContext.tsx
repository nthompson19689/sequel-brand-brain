"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MODULES, getDefaultModules } from "@/lib/modules";
import type { UserRole } from "@/lib/modules";

interface PreferencesCtx {
  /** Array of enabled module IDs */
  enabledModules: string[];
  /** Whether the user still needs to pick a role (first login) */
  needsOnboarding: boolean;
  /** Current module_role from the profile */
  moduleRole: UserRole | null;
  /** Loading state */
  loading: boolean;
  /** Set the user's role and populate default modules */
  completeOnboarding: (role: UserRole) => Promise<void>;
  /** Toggle a single module on/off */
  toggleModule: (moduleId: string) => Promise<void>;
  /** Replace the entire enabled modules list */
  setModules: (moduleIds: string[]) => Promise<void>;
  /** Check if a module is enabled */
  isEnabled: (moduleId: string) => boolean;
}

const Ctx = createContext<PreferencesCtx | null>(null);

export function usePreferences() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [moduleRole, setModuleRole] = useState<UserRole | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchPreferences = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/preferences");
      if (res.ok) {
        const data = await res.json();
        if (data.preferences) {
          setEnabledModules(data.preferences.enabled_modules || []);
          setNeedsOnboarding(false);
        } else {
          // No preferences row yet — check if they have a role
          const role = profile?.module_role as UserRole | null;
          if (role) {
            // Has role but no preferences row — create defaults
            const defaults = getDefaultModules(role);
            await saveModules(defaults);
            setEnabledModules(defaults);
            setNeedsOnboarding(false);
          } else {
            // First login — needs onboarding
            setEnabledModules(MODULES.map((m) => m.id)); // show all until they choose
            setNeedsOnboarding(true);
          }
        }
      }
    } catch (err) {
      console.error("[Preferences] load failed:", err);
      // Fallback: show all modules
      setEnabledModules(MODULES.map((m) => m.id));
    } finally {
      setLoading(false);
    }
  }, [user?.id, profile]);

  useEffect(() => {
    if (profile !== null) {
      const role = profile?.module_role as UserRole | null;
      setModuleRole(role);
      fetchPreferences();
    }
  }, [profile, fetchPreferences]);

  async function saveModules(moduleIds: string[]) {
    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled_modules: moduleIds }),
      });
    } catch {
      // non-critical
    }
  }

  async function completeOnboarding(role: UserRole) {
    const defaults = getDefaultModules(role);
    setEnabledModules(defaults);
    setModuleRole(role);
    setNeedsOnboarding(false);

    // Save role to profile + create preferences
    try {
      await fetch("/api/preferences/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, enabled_modules: defaults }),
      });
    } catch (err) {
      console.error("[Preferences] onboarding save failed:", err);
    }
  }

  async function toggleModule(moduleId: string) {
    const next = enabledModules.includes(moduleId)
      ? enabledModules.filter((m) => m !== moduleId)
      : [...enabledModules, moduleId];
    setEnabledModules(next);
    await saveModules(next);
  }

  async function setModulesHandler(moduleIds: string[]) {
    setEnabledModules(moduleIds);
    await saveModules(moduleIds);
  }

  function isEnabled(moduleId: string) {
    return enabledModules.includes(moduleId);
  }

  return (
    <Ctx.Provider
      value={{
        enabledModules,
        needsOnboarding,
        moduleRole,
        loading,
        completeOnboarding,
        toggleModule,
        setModules: setModulesHandler,
        isEnabled,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
