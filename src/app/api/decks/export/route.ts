import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { DEFAULT_THEMES, type Slide, type ThemeColors, type ThemeFonts } from "@/lib/decks";

export const runtime = "nodejs";

function hexToRgb(hex: string): string {
  return hex.replace("#", "");
}

function lighten(hex: string, pct: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * pct));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * pct));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * pct));
  return ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

function fontSize(base: number, preset: ThemeFonts["sizePreset"]): number {
  if (preset === "large") return Math.round(base * 1.2);
  if (preset === "compact") return Math.round(base * 0.85);
  return base;
}

export async function POST(request: NextRequest) {
  try {
    const { slides, theme_id, title } = (await request.json()) as {
      slides: Slide[];
      theme_id?: string;
      title?: string;
    };

    // Load theme
    let colors: ThemeColors = { primary: "#7C3AED", secondary: "#6D28D9", accent: "#A78BFA", background: "mixed" };
    let fonts: ThemeFonts = { header: "Georgia", body: "Calibri", sizePreset: "default" };
    let footerText = "";

    if (theme_id) {
      const supabase = getSupabaseServerClient();
      if (supabase) {
        const { data } = await supabase.from("presentation_themes").select("*").eq("id", theme_id).single();
        if (data) {
          colors = data.colors as ThemeColors;
          fonts = data.fonts as ThemeFonts;
          footerText = data.footer_text || "";
        }
      }
    }
    if (!colors.primary) {
      const def = DEFAULT_THEMES[0];
      colors = def.colors;
      fonts = def.fonts;
    }

    const primary = hexToRgb(colors.primary);
    const secondary = hexToRgb(colors.secondary);
    const accent = hexToRgb(colors.accent);
    const primaryLight = lighten(colors.primary, 0.85);
    const isDark = (idx: number) =>
      colors.background === "dark" ||
      (colors.background === "mixed" && (idx === 0 || idx === slides.length - 1));

    // Dynamic import pptxgenjs (it's a CJS module)
    const PptxGenJS = (await import("pptxgenjs")).default;
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const RECT = pptx.ShapeType?.rect || ("rect" as any);

    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      const slide = pptx.addSlide();
      const dark = isDark(i);

      const bg = dark ? secondary : "FFFFFF";
      slide.background = { color: bg };

      const textColor = dark ? "FFFFFF" : "1A1025";
      const subtextColor = dark ? "C4C0D0" : "6B6680";

      // Footer on every slide
      if (footerText) {
        slide.addText(footerText, {
          x: 0.5, y: 5.15, w: 8, h: 0.3,
          fontSize: 8, color: subtextColor, fontFace: fonts.body,
        });
      }

      switch (s.layout) {
        case "title_slide": {
          slide.background = { color: primary };
          // Accent line
          slide.addShape(RECT, {
            x: 0.7, y: 2.4, w: 1.5, h: 0.06, fill: { color: accent },
          });
          slide.addText(s.title || title || "Untitled", {
            x: 0.7, y: 1.0, w: 10, h: 1.4,
            fontSize: fontSize(40, fonts.sizePreset), fontFace: fonts.header,
            color: "FFFFFF", bold: true, lineSpacingMultiple: 1.1,
          });
          slide.addText(s.subtitle || "", {
            x: 0.7, y: 2.7, w: 8, h: 0.8,
            fontSize: fontSize(18, fonts.sizePreset), fontFace: fonts.body,
            color: "E0D6F0",
          });
          break;
        }

        case "bullets": {
          // Title bar accent
          slide.addShape(RECT, {
            x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: primary },
          });
          slide.addText(s.title, {
            x: 0.7, y: 0.4, w: 11, h: 0.7,
            fontSize: fontSize(28, fonts.sizePreset), fontFace: fonts.header,
            color: textColor, bold: true,
          });
          const bullets = (s.body || "").split("\n").filter(Boolean).map((line) => ({
            text: line.replace(/^[•\-]\s*/, ""),
            options: {
              bullet: { code: "2022" },
              fontSize: fontSize(16, fonts.sizePreset),
              fontFace: fonts.body,
              color: textColor,
              lineSpacingMultiple: 1.6,
              paraSpaceBefore: 4,
            },
          }));
          slide.addText(bullets as never, {
            x: 0.9, y: 1.3, w: 10.5, h: 3.5,
            valign: "top",
          });
          break;
        }

        case "two_column": {
          slide.addShape(RECT, { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: primary } });
          slide.addText(s.title, {
            x: 0.7, y: 0.4, w: 11, h: 0.7,
            fontSize: fontSize(28, fonts.sizePreset), fontFace: fonts.header,
            color: textColor, bold: true,
          });
          // Left column
          slide.addText(s.body || "", {
            x: 0.7, y: 1.4, w: 5.5, h: 3.5,
            fontSize: fontSize(14, fonts.sizePreset), fontFace: fonts.body,
            color: textColor, valign: "top", lineSpacingMultiple: 1.5,
          });
          // Right column with accent bg
          slide.addShape(RECT, {
            x: 6.8, y: 1.3, w: 5.8, h: 3.7,
            fill: { color: primaryLight }, rectRadius: 0.15,
          });
          slide.addText(s.subtitle || "", {
            x: 7.1, y: 1.5, w: 5.2, h: 3.3,
            fontSize: fontSize(14, fonts.sizePreset), fontFace: fonts.body,
            color: primary, valign: "top", lineSpacingMultiple: 1.5,
          });
          break;
        }

        case "three_cards": {
          slide.addShape(RECT, { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: primary } });
          slide.addText(s.title, {
            x: 0.7, y: 0.4, w: 11, h: 0.7,
            fontSize: fontSize(28, fonts.sizePreset), fontFace: fonts.header,
            color: textColor, bold: true,
          });
          const cards = s.cards || [
            { icon: "💡", title: "Card 1", body: s.body || "" },
            { icon: "⚡", title: "Card 2", body: "" },
            { icon: "🎯", title: "Card 3", body: "" },
          ];
          cards.forEach((card, ci) => {
            const cx = 0.7 + ci * 4;
            // Card bg
            slide.addShape(RECT, {
              x: cx, y: 1.4, w: 3.6, h: 3.4,
              fill: { color: dark ? lighten(colors.secondary, 0.08) : "F9F8FC" },
              rectRadius: 0.15,
              shadow: { type: "outer", blur: 6, offset: 2, color: "000000", opacity: 0.08 },
            });
            // Accent top border
            slide.addShape(RECT, {
              x: cx, y: 1.4, w: 3.6, h: 0.06, fill: { color: accent },
            });
            slide.addText(card.icon, {
              x: cx + 0.3, y: 1.7, w: 1, h: 0.6, fontSize: 28,
            });
            slide.addText(card.title, {
              x: cx + 0.3, y: 2.3, w: 3, h: 0.5,
              fontSize: fontSize(16, fonts.sizePreset), fontFace: fonts.header,
              color: textColor, bold: true,
            });
            slide.addText(card.body, {
              x: cx + 0.3, y: 2.8, w: 3, h: 1.7,
              fontSize: fontSize(12, fonts.sizePreset), fontFace: fonts.body,
              color: subtextColor, valign: "top", lineSpacingMultiple: 1.4,
            });
          });
          break;
        }

        case "comparison_table": {
          slide.addShape(RECT, { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: primary } });
          slide.addText(s.title, {
            x: 0.7, y: 0.4, w: 11, h: 0.7,
            fontSize: fontSize(28, fonts.sizePreset), fontFace: fonts.header,
            color: textColor, bold: true,
          });
          const cols = s.columns || [{ header: "Us", rows: [] }, { header: "Them", rows: [] }];
          const maxRows = Math.max(...cols.map((c) => c.rows.length), 1);
          const colW = 5.5;
          cols.forEach((col, ci) => {
            const cx = 0.7 + ci * (colW + 0.5);
            // Header
            slide.addShape(RECT, {
              x: cx, y: 1.4, w: colW, h: 0.55, fill: { color: ci === 0 ? primary : "4B5563" }, rectRadius: 0.1,
            });
            slide.addText(col.header, {
              x: cx, y: 1.4, w: colW, h: 0.55,
              fontSize: fontSize(14, fonts.sizePreset), fontFace: fonts.header,
              color: "FFFFFF", bold: true, align: "center", valign: "middle",
            });
            // Rows
            col.rows.forEach((row, ri) => {
              const ry = 2.05 + ri * 0.55;
              const rowBg = ri % 2 === 0 ? (dark ? lighten(colors.secondary, 0.05) : "F9FAFB") : (dark ? secondary : "FFFFFF");
              slide.addShape(RECT, {
                x: cx, y: ry, w: colW, h: 0.5, fill: { color: rowBg },
              });
              slide.addText(row, {
                x: cx + 0.2, y: ry, w: colW - 0.4, h: 0.5,
                fontSize: fontSize(12, fonts.sizePreset), fontFace: fonts.body,
                color: textColor, valign: "middle",
              });
            });
            // Fill empty rows
            for (let ri = col.rows.length; ri < maxRows; ri++) {
              const ry = 2.05 + ri * 0.55;
              const rowBg = ri % 2 === 0 ? (dark ? lighten(colors.secondary, 0.05) : "F9FAFB") : (dark ? secondary : "FFFFFF");
              slide.addShape(RECT, {
                x: cx, y: ry, w: colW, h: 0.5, fill: { color: rowBg },
              });
            }
          });
          break;
        }

        case "stats_callout": {
          slide.addShape(RECT, { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: primary } });
          slide.addText(s.title, {
            x: 0.7, y: 0.4, w: 11, h: 0.7,
            fontSize: fontSize(28, fonts.sizePreset), fontFace: fonts.header,
            color: textColor, bold: true,
          });
          const stats = s.stats || [{ value: "—", label: "No data" }];
          const sw = 10.5 / stats.length;
          stats.forEach((stat, si) => {
            const sx = 0.7 + si * sw + (sw - 3) / 2;
            slide.addText(stat.value, {
              x: sx, y: 1.6, w: 3, h: 1.4,
              fontSize: fontSize(48, fonts.sizePreset), fontFace: fonts.header,
              color: accent, bold: true, align: "center",
            });
            slide.addText(stat.label, {
              x: sx, y: 3.0, w: 3, h: 0.6,
              fontSize: fontSize(14, fonts.sizePreset), fontFace: fonts.body,
              color: subtextColor, align: "center",
            });
          });
          break;
        }

        case "image_left":
        case "image_right": {
          slide.addShape(RECT, { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: primary } });
          const isLeft = s.layout === "image_left";
          const imgX = isLeft ? 0.5 : 7.0;
          const txtX = isLeft ? 6.8 : 0.7;
          // Image placeholder
          slide.addShape(RECT, {
            x: imgX, y: 0.5, w: 5.8, h: 4.5,
            fill: { color: primaryLight }, rectRadius: 0.15,
          });
          slide.addText("[ Image ]", {
            x: imgX, y: 0.5, w: 5.8, h: 4.5,
            fontSize: 18, fontFace: fonts.body, color: primary,
            align: "center", valign: "middle",
          });
          slide.addText(s.title, {
            x: txtX, y: 0.8, w: 5.5, h: 0.7,
            fontSize: fontSize(24, fonts.sizePreset), fontFace: fonts.header,
            color: textColor, bold: true,
          });
          slide.addText(s.body || "", {
            x: txtX, y: 1.7, w: 5.5, h: 3,
            fontSize: fontSize(14, fonts.sizePreset), fontFace: fonts.body,
            color: textColor, valign: "top", lineSpacingMultiple: 1.5,
          });
          break;
        }

        case "quote": {
          const qBg = dark ? secondary : primaryLight;
          slide.background = { color: qBg };
          slide.addText(`"${s.title}"`, {
            x: 1.5, y: 1.0, w: 10, h: 2.5,
            fontSize: fontSize(28, fonts.sizePreset), fontFace: fonts.header,
            color: dark ? "FFFFFF" : primary, italic: true,
            align: "center", valign: "middle", lineSpacingMultiple: 1.3,
          });
          slide.addShape(RECT, {
            x: 5.5, y: 3.5, w: 2, h: 0.04, fill: { color: accent },
          });
          slide.addText(s.subtitle || "", {
            x: 2, y: 3.7, w: 9, h: 0.6,
            fontSize: fontSize(14, fonts.sizePreset), fontFace: fonts.body,
            color: dark ? "C4C0D0" : "6B6680", align: "center",
          });
          break;
        }

        case "closing": {
          slide.background = { color: primary };
          slide.addShape(RECT, {
            x: 5.5, y: 2.2, w: 2, h: 0.06, fill: { color: accent },
          });
          slide.addText(s.title || "Thank You", {
            x: 1, y: 1.0, w: 11, h: 1.2,
            fontSize: fontSize(36, fonts.sizePreset), fontFace: fonts.header,
            color: "FFFFFF", bold: true, align: "center",
          });
          slide.addText(s.subtitle || s.body || "", {
            x: 2, y: 2.6, w: 9, h: 1,
            fontSize: fontSize(16, fonts.sizePreset), fontFace: fonts.body,
            color: "D4C8F0", align: "center",
          });
          break;
        }

        default: {
          // Fallback: treat as bullets
          slide.addText(s.title, {
            x: 0.7, y: 0.5, w: 11, h: 0.7,
            fontSize: fontSize(28, fonts.sizePreset), fontFace: fonts.header,
            color: textColor, bold: true,
          });
          slide.addText(s.body || "", {
            x: 0.7, y: 1.5, w: 11, h: 3.5,
            fontSize: fontSize(14, fonts.sizePreset), fontFace: fonts.body,
            color: textColor, valign: "top",
          });
        }
      }

      // Speaker notes
      if (s.speakerNotes) {
        slide.addNotes(s.speakerNotes);
      }
    }

    const buffer = await pptx.write({ outputType: "nodebuffer" }) as Buffer;
    const uint8 = new Uint8Array(buffer);

    return new NextResponse(uint8, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${(title || "deck").replace(/[^a-zA-Z0-9 -]/g, "")}.pptx"`,
      },
    });
  } catch (err) {
    console.error("[Export] PPTX error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
