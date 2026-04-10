"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import OnboardingGate from "@/components/OnboardingGate";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <PreferencesProvider>
          <OnboardingGate>{children}</OnboardingGate>
        </PreferencesProvider>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
