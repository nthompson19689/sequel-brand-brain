"use client";

interface Source {
  type: "brand_doc" | "article";
  id: string;
  name: string;
  doc_type?: string;
  url?: string | null;
  similarity?: number;
}

export default function SourceCard({ source }: { source: Source }) {
  const isBrandDoc = source.type === "brand_doc";
  const label = isBrandDoc
    ? source.doc_type?.replace(/_/g, " ") || "Brand Doc"
    : "Article";

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-xs text-gray-600 border border-gray-200">
      {isBrandDoc ? (
        <svg className="w-3.5 h-3.5 text-brand-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      )}
      <span className="capitalize font-medium text-gray-500">{label}</span>
      <span className="text-gray-700">{source.name}</span>
      {source.similarity != null && (
        <span className="text-gray-400">{(source.similarity * 100).toFixed(0)}%</span>
      )}
    </div>
  );
}
