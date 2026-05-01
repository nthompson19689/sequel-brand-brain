"use client";

import Link from "next/link";
import CallsSection from "@/components/brain/CallsSection";

export default function BrainCallsPage() {
  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <div className="text-xs text-gray-500 mb-1">
          <Link href="/brain" className="hover:text-gray-700">Brand Brain</Link>
          <span className="mx-1.5 text-gray-400">/</span>
          <span className="text-gray-700">Calls</span>
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">Calls</h1>
        <p className="mt-1 text-sm text-gray-500">
          Import calls from Fathom, classify them automatically, and feed them into the Brand Brain.
        </p>
      </div>
      <CallsSection />
    </div>
  );
}
