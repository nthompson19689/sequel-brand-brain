"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserAuthClient } from "@/lib/supabase-auth";

export default function LoginPage() {
  const router = useRouter();
  const [supabase] = useState(() => createSupabaseBrowserAuthClient());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="bg-[#1A1228] rounded-2xl border border-[#2A2040] p-8 shadow-2xl">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white">Sequel Brand Brain</h1>
        <p className="text-sm text-[#A09CB0] mt-2">Sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#A09CB0] mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-xl border border-[#2A2040] bg-[#0F0A1A] px-4 py-3 text-sm text-white placeholder-[#6B6680] focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#A09CB0] mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-xl border border-[#2A2040] bg-[#0F0A1A] px-4 py-3 text-sm text-white placeholder-[#6B6680] focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
            placeholder="Your password"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 text-sm font-semibold text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="text-center text-sm text-[#6B6680] mt-6">
        This workspace is invite-only.
      </p>
    </div>
  );
}
