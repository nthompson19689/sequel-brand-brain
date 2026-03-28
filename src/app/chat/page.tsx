"use client";

import ChatInterface from "@/components/chat/ChatInterface";

export default function ChatPage() {
  return (
    <div className="h-screen">
      <ChatInterface
        placeholder="Ask the Brand Brain..."
        emptyTitle="Brand Brain Chat"
        emptyDescription="Ask anything about brand voice, content strategy, or competitive positioning. Answers are grounded in your company data."
        suggestions={[
          "What is our brand voice?",
          "How do we position against competitors?",
          "What are our content guidelines?",
        ]}
      />
    </div>
  );
}
