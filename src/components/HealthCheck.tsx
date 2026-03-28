"use client";

import { useEffect } from "react";

export default function HealthCheck() {
  useEffect(() => {
    // Ping health endpoint on app startup to test Supabase connection
    // The server-side logs will show the result in the terminal
    fetch("/api/health").catch(() => {});
  }, []);

  return null;
}
