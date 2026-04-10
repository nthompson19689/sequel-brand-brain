"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

export default function TodosPage() {
  const { profile } = useAuth();
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  function toggleTodo(id: string) {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  }

  function removeTodo(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;

    setChatMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setIsGenerating(true);

    try {
      const currentTodos = todos.map((t) => `- [${t.done ? "x" : " "}] ${t.text}`).join("\n");

      const systemPrompt = `You are a helpful daily planner inside the Sequel Brand Brain app. The user "${profile?.full_name || "User"}" is talking through what they need to get done.

Your job:
1. Listen to what they describe
2. Extract actionable to-do items from their message
3. Return ONLY a JSON array of strings — each string is one to-do item
4. Keep items concise (under 80 chars each)
5. If they're just chatting and not adding tasks, return an empty array []

Current to-do list:
${currentTodos || "(empty)"}

IMPORTANT: Your response MUST be valid JSON. No markdown, no explanation — just the array.
Example: ["Review Q2 pipeline deck", "Draft blog post on event engagement", "Prep for 3pm call with design"]`;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: trimmed }],
          systemPrompt,
        }),
      });

      if (!res.ok) throw new Error("Chat failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No body");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "text") fullText += event.text;
          } catch {
            continue;
          }
        }
      }

      // Parse the AI response as JSON array of to-do items
      let newItems: string[] = [];
      try {
        // Strip markdown code fences if present
        const cleaned = fullText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          newItems = parsed.filter((s: unknown) => typeof s === "string" && s.trim());
        }
      } catch {
        // If parsing fails, try to extract items manually
        const lines = fullText.split("\n").filter((l) => l.trim());
        newItems = lines
          .map((l) => l.replace(/^[-*•]\s*/, "").replace(/^\d+\.\s*/, "").trim())
          .filter((l) => l.length > 0 && l.length < 200);
      }

      if (newItems.length > 0) {
        const newTodos: TodoItem[] = newItems.map((text) => ({
          id: crypto.randomUUID(),
          text,
          done: false,
        }));
        setTodos((prev) => [...prev, ...newTodos]);
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: `Added ${newItems.length} item${newItems.length > 1 ? "s" : ""} to your list.`,
          },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", text: "Got it. Anything else to add?" },
        ]);
      }
    } catch (err) {
      console.error(err);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Something went wrong. Try again?" },
      ]);
    } finally {
      setIsGenerating(false);
      inputRef.current?.focus();
    }
  }

  const completedCount = todos.filter((t) => t.done).length;
  const totalCount = todos.length;

  return (
    <div className="flex h-screen">
      {/* Left: To-do list */}
      <div className="w-[420px] border-r border-border bg-surface flex flex-col">
        <div className="p-6 border-b border-border">
          <h1 className="text-xl font-semibold text-heading">Today&apos;s To-Do&apos;s</h1>
          {totalCount > 0 && (
            <p className="text-xs text-muted mt-1">
              {completedCount}/{totalCount} completed
            </p>
          )}
          {totalCount > 0 && (
            <div className="mt-2 h-1.5 bg-surface-raised rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 transition-all duration-300"
                style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {todos.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-brand-100 text-brand-500 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <p className="text-sm text-body">No to-do&apos;s yet.</p>
              <p className="text-xs text-muted mt-1">
                Tell me what you need to get done today →
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {todos.map((todo) => (
                <div
                  key={todo.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-all group ${
                    todo.done
                      ? "border-border-light bg-surface-raised/50"
                      : "border-border bg-surface-card shadow-card"
                  }`}
                >
                  <button
                    onClick={() => toggleTodo(todo.id)}
                    className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                      todo.done
                        ? "bg-brand-500 border-brand-500 text-white"
                        : "border-border hover:border-brand-300"
                    }`}
                  >
                    {todo.done && (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                  <span
                    className={`flex-1 text-sm leading-relaxed ${
                      todo.done ? "line-through text-muted" : "text-heading"
                    }`}
                  >
                    {todo.text}
                  </span>
                  <button
                    onClick={() => removeTodo(todo.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted hover:text-red-500 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Chat interface */}
      <div className="flex-1 flex flex-col bg-surface-card">
        <div className="p-6 border-b border-border">
          <h2 className="text-sm font-semibold text-heading">Talk through your day</h2>
          <p className="text-xs text-muted mt-0.5">
            Tell me what&apos;s on your plate — I&apos;ll turn it into a checklist
          </p>
        </div>

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto p-6">
          {chatMessages.length === 0 && (
            <div className="text-center py-16 text-muted">
              <p className="text-sm mb-4">Try something like:</p>
              <div className="space-y-2">
                {[
                  "I need to prep for the board meeting, review the Q2 pipeline, and finalize the blog post",
                  "What should I prioritize if I only have 3 hours today?",
                  "Add: follow up with Sarah about the partnership deal",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="block mx-auto px-4 py-2 text-xs text-body bg-surface-raised hover:bg-brand-100 hover:text-brand-700 rounded-lg border border-border-light transition-colors max-w-md text-left"
                  >
                    &ldquo;{suggestion}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-4 max-w-2xl mx-auto">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                    msg.role === "user"
                      ? "bg-brand-500 text-white rounded-br-md"
                      : "bg-surface-raised text-body border border-border-light rounded-bl-md"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isGenerating && (
              <div className="flex justify-start">
                <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-surface-raised border border-border-light">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border">
          <form onSubmit={handleSubmit} className="flex items-end gap-3 max-w-2xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="What do you need to get done today?"
              rows={1}
              className="flex-1 px-4 py-3 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none bg-surface"
            />
            <button
              type="submit"
              disabled={!input.trim() || isGenerating}
              className="px-4 py-3 bg-brand-500 text-white rounded-xl hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
