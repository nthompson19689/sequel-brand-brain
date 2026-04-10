"use client";

import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import RoleSelector from "@/components/onboarding/RoleSelector";
import { usePathname } from "next/navigation";

/**
 * Renders the onboarding screen if the user hasn't selected a role yet.
 * Skips the gate on auth pages (login/signup) and while loading.
 */
export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { needsOnboarding, loading: prefLoading } = usePreferences();

  // Don't block auth pages
  const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/signup");
  if (isAuthPage) return <>{children}</>;

  // Still loading — don't flash anything
  if (authLoading || prefLoading) return <>{children}</>;

  // Not logged in — let the auth flow handle it
  if (!user) return <>{children}</>;

  // Show onboarding if needed
  if (needsOnboarding) return <RoleSelector />;

  return <>{children}</>;
}
