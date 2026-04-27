/**
 * Shared file-text extraction. Mirrors /api/brain/upload but callable
 * from any route handler that processes uploads.
 *
 * Supports: .txt, .md, .docx, .doc (best-effort), .pdf, .csv
 */

export interface ParsedUpload {
  text: string;
  filename: string;
  fileType: string;
  wordCount: number;
}

export async function extractTextFromFile(file: File): Promise<ParsedUpload> {
  const filename = file.name;
  const lower = filename.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  let text = "";
  let fileType = "";

  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    fileType = lower.endsWith(".md") ? "md" : "txt";
    text = buffer.toString("utf-8");
  } else if (lower.endsWith(".csv")) {
    fileType = "csv";
    text = buffer.toString("utf-8");
  } else if (lower.endsWith(".docx")) {
    fileType = "docx";
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (lower.endsWith(".doc")) {
    fileType = "doc";
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } catch {
      text = extractTextFromBinary(buffer);
    }
  } else if (lower.endsWith(".pdf")) {
    fileType = "pdf";
    // pdf-parse v1's index.js has a debug block that tries to read a test
    // PDF on import. Import the inner module directly to avoid it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse/lib/pdf-parse.js");
    const result = await pdfParse(buffer);
    text = result.text;
  } else {
    throw new Error(
      `Unsupported file type. Accepted: .txt, .md, .csv, .docx, .doc, .pdf`,
    );
  }

  text = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

  if (!text) {
    throw new Error("No text content found in file");
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return { text, filename, fileType, wordCount };
}

function extractTextFromBinary(buffer: Buffer): string {
  const str = buffer.toString("latin1");
  const runs = str.match(/[\x20-\x7E\xA0-\xFF]{20,}/g) || [];
  return runs.join("\n").trim();
}
