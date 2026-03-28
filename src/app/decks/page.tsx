"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Deck } from "@/lib/decks";

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DecksPage() {
  const router = useRouter();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "mine" | "shared">("all");

  useEffect(() => {
    (async () => {
      try {
        const params = filter === "shared" ? "?filter=shared" : "";
        const res = await fetch(`/api/decks${params}`);
        if (res.ok) {
          const data = await res.json();
          setDecks(data.decks || []);
        }
      } catch { /* */ }
      setLoading(false);
    })();
  }, [filter]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this deck?")) return;
    await fetch(`/api/decks?id=${id}`, { method: "DELETE" });
    setDecks((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleDuplicate(deck: Deck) {
    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `${deck.title} (Copy)`, slides: deck.slides, theme_id: deck.theme_id }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/decks/${data.deck.id}`);
    }
  }

  async function handleExport(deck: Deck) {
    const res = await fetch("/api/decks/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: deck.slides, theme_id: deck.theme_id, title: deck.title }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${deck.title || "deck"}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-heading">Decks</h1>
          <p className="mt-1 text-sm text-body">Build and manage presentation decks.</p>
        </div>
        <button
          onClick={() => router.push("/decks/new")}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Deck
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-6">
        {(["all", "mine", "shared"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize ${
              filter === f ? "bg-white text-heading shadow-sm" : "text-body hover:text-heading"
            }`}
          >
            {f === "mine" ? "My Decks" : f === "shared" ? "Shared" : "All Decks"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : decks.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-border">
          <div className="w-16 h-16 mx-auto bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-brand-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-heading">No decks yet</h3>
          <p className="mt-1 text-sm text-body">Create your first presentation deck.</p>
          <button
            onClick={() => router.push("/decks/new")}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 transition-colors"
          >
            + New Deck
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((deck) => {
            const slideCount = Array.isArray(deck.slides) ? deck.slides.length : 0;
            const firstSlide = Array.isArray(deck.slides) && deck.slides[0] ? deck.slides[0] : null;

            return (
              <div
                key={deck.id}
                className="bg-white rounded-xl border border-border hover:border-brand-200 hover:shadow-md transition-all group cursor-pointer overflow-hidden"
                onClick={() => router.push(`/decks/${deck.id}`)}
              >
                {/* Thumbnail preview */}
                <div className="h-36 bg-gradient-to-br from-brand-50 to-brand-100 p-4 flex flex-col justify-end">
                  <p className="text-lg font-semibold text-brand-700 line-clamp-2">
                    {firstSlide?.title || deck.title || "Untitled"}
                  </p>
                  {firstSlide?.subtitle && (
                    <p className="text-xs text-brand-500 mt-1 truncate">{firstSlide.subtitle}</p>
                  )}
                </div>

                <div className="p-4">
                  <h3 className="text-sm font-semibold text-heading truncate">{deck.title}</h3>
                  <div className="flex items-center gap-3 mt-2 text-xs text-body">
                    <span>{slideCount} slides</span>
                    <span>·</span>
                    <span>{timeAgo(deck.updated_at)}</span>
                    {deck.is_shared && (
                      <>
                        <span>·</span>
                        <span className="text-brand-500">Shared</span>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleExport(deck); }}
                      className="px-2.5 py-1.5 text-xs font-medium text-body bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Download
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDuplicate(deck); }}
                      className="px-2.5 py-1.5 text-xs font-medium text-body bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Duplicate
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(deck.id); }}
                      className="px-2.5 py-1.5 text-xs font-medium text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
