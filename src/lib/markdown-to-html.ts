/**
 * Simple markdown to HTML converter for loading agent output into Tiptap.
 * Handles the common patterns Claude produces.
 */
export function markdownToHtml(md: string): string {
  if (!md) return "";

  let html = md;

  // Escape any raw HTML (except our converted tags)
  // Actually, leave as-is since Claude sometimes outputs HTML

  // Headings (### before ## before #)
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>");

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>'
  );

  // Horizontal rules
  html = html.replace(/^---$/gm, "<hr>");

  // Unordered lists
  html = html.replace(/^(\s*)[-*] (.+)$/gm, (_, indent, text) => {
    const depth = indent.length;
    return `<__ul_item depth="${depth}">${text}</__ul_item>`;
  });

  // Ordered lists
  html = html.replace(/^(\s*)\d+\. (.+)$/gm, (_, indent, text) => {
    const depth = indent.length;
    return `<__ol_item depth="${depth}">${text}</__ol_item>`;
  });

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, "<blockquote><p>$1</p></blockquote>");

  // Now wrap list items properly
  html = wrapListItems(html, "__ul_item", "ul");
  html = wrapListItems(html, "__ol_item", "ol");

  // Paragraphs: wrap remaining text lines
  const lines = html.split("\n");
  const result: string[] = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inParagraph) {
        inParagraph = false;
      }
      continue;
    }

    if (
      trimmed.startsWith("<h") ||
      trimmed.startsWith("<ul") ||
      trimmed.startsWith("<ol") ||
      trimmed.startsWith("<li") ||
      trimmed.startsWith("</") ||
      trimmed.startsWith("<hr") ||
      trimmed.startsWith("<blockquote") ||
      trimmed.startsWith("<p>")
    ) {
      result.push(trimmed);
      inParagraph = false;
    } else {
      result.push(`<p>${trimmed}</p>`);
      inParagraph = true;
    }
  }

  return result.join("\n");
}

function wrapListItems(
  html: string,
  itemTag: string,
  listTag: string
): string {
  let inList = false;
  const lines = html.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const match = line.match(
      new RegExp(`<${itemTag}[^>]*>(.+?)</${itemTag}>`)
    );
    if (match) {
      if (!inList) {
        result.push(`<${listTag}>`);
        inList = true;
      }
      result.push(`<li><p>${match[1]}</p></li>`);
    } else {
      if (inList) {
        result.push(`</${listTag}>`);
        inList = false;
      }
      result.push(line);
    }
  }
  if (inList) result.push(`</${listTag}>`);

  return result.join("\n");
}
