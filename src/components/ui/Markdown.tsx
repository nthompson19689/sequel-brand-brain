"use client";

import ReactMarkdown from "react-markdown";

export default function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="text-xl font-bold text-gray-900 mt-5 mb-2 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-semibold text-gray-900 mt-5 mb-2 first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-semibold text-gray-800 mt-4 mb-1.5">{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-sm font-semibold text-gray-800 mt-3 mb-1">{children}</h4>
        ),
        p: ({ children }) => (
          <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="mb-3 ml-4 space-y-1 list-disc marker:text-gray-400">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 ml-4 space-y-1 list-decimal marker:text-gray-400">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed">{children}</li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-gray-900">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-500 underline decoration-brand-300 hover:decoration-brand-500 transition-colors">
            {children}
          </a>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="mb-3 rounded-lg bg-gray-900 text-gray-100 p-3 text-xs font-mono overflow-x-auto">
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-[0.9em] font-mono">{children}</code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => (
          <blockquote className="mb-3 border-l-3 border-brand-300 pl-3 text-gray-600 italic">{children}</blockquote>
        ),
        hr: () => <hr className="my-4 border-gray-200" />,
        table: ({ children }) => (
          <div className="mb-3 overflow-x-auto">
            <table className="min-w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-gray-50">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-1.5 text-left font-semibold text-gray-700 border-b border-gray-200">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-1.5 text-gray-700 border-b border-gray-100">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
