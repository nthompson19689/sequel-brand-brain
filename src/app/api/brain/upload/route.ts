import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/brain/upload — Parse uploaded files (.txt, .docx, .doc, .pdf)
 * and return extracted text. Does NOT save to Supabase — the client
 * populates the form with the extracted text, then saves via /api/brain/docs.
 *
 * Accepts multipart/form-data with a "file" field.
 * Returns { text: string, filename: string, wordCount: number }
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    const filename = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let text = "";

    if (filename.endsWith(".txt") || filename.endsWith(".md")) {
      // Plain text / Markdown
      text = buffer.toString("utf-8");
    } else if (filename.endsWith(".docx")) {
      // DOCX via mammoth
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (filename.endsWith(".doc")) {
      // Legacy .doc — mammoth can handle some .doc files
      // For unsupported formats, fall back to basic text extraction
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } catch {
        // Fallback: try to extract readable text from binary
        text = extractTextFromBinary(buffer);
        if (text.length < 50) {
          return Response.json(
            {
              error:
                "Could not parse this .doc file. Try saving it as .docx or .txt first.",
            },
            { status: 400 }
          );
        }
      }
    } else if (filename.endsWith(".pdf")) {
      // PDF via pdf-parse
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const result = await pdfParse(buffer);
      text = result.text;
    } else {
      return Response.json(
        {
          error: `Unsupported file type. Accepted: .txt, .md, .docx, .doc, .pdf`,
        },
        { status: 400 }
      );
    }

    // Clean up the extracted text
    text = text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();

    if (!text) {
      return Response.json(
        { error: "No text content found in file" },
        { status: 400 }
      );
    }

    const wordCount = text.split(/\s+/).filter(Boolean).length;

    return Response.json({
      text,
      filename: file.name,
      wordCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "File parsing failed";
    console.error("[Upload] Error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

/**
 * Best-effort extraction of readable text from a binary .doc file.
 * Filters for printable ASCII/Unicode runs.
 */
function extractTextFromBinary(buffer: Buffer): string {
  const str = buffer.toString("latin1");
  // Find runs of printable characters (at least 20 chars long)
  const runs = str.match(/[\x20-\x7E\xA0-\xFF]{20,}/g) || [];
  return runs.join("\n").trim();
}
