import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";

type InlinePart = { kind: "text" | "inline"; text: string };
type Part = InlinePart | { kind: "display"; text: string };
type Block = { kind: "paragraph"; parts: InlinePart[] } | { kind: "display"; text: string };

function escapedAt(source: string, index: number): boolean {
  let backslashes = 0;
  while (index > 0 && source[--index] === "\\") backslashes++;
  return backslashes % 2 === 1;
}

function parseMath(source: string): Block[] {
  const parts: Part[] = [];
  let textStart = 0;
  let cursor = 0;
  while (cursor < source.length) {
    if (source[cursor] !== "$" || escapedAt(source, cursor)) {
      cursor++;
      continue;
    }
    const display = source[cursor + 1] === "$";
    const width = display ? 2 : 1;
    let end = cursor + width;
    let closed = false;
    while (end < source.length) {
      if (!display && (source[end] === "\n" || source[end] === "\r")) break;
      if (source[end] === "$" && !escapedAt(source, end)) {
        if (display ? source[end + 1] === "$" : source[end + 1] !== "$" && source[end - 1] !== "$") {
          closed = true;
          break;
        }
      }
      end++;
    }
    if (!closed) {
      cursor += width;
      continue;
    }
    if (cursor > textStart) parts.push({ kind: "text", text: source.slice(textStart, cursor) });
    parts.push({ kind: display ? "display" : "inline", text: source.slice(cursor + width, end) });
    cursor = end + width;
    textStart = cursor;
  }
  if (textStart < source.length) parts.push({ kind: "text", text: source.slice(textStart) });

  const blocks: Block[] = [];
  let paragraph: InlinePart[] = [];
  const flush = () => {
    if (paragraph.some((part) => part.kind === "inline" || part.text.trim())) {
      blocks.push({ kind: "paragraph", parts: paragraph });
    }
    paragraph = [];
  };
  for (const part of parts) {
    if (part.kind === "display") {
      flush();
      blocks.push(part);
    } else if (part.kind === "inline") {
      paragraph.push(part);
    } else {
      const paragraphs = part.text.replace(/\r\n?/g, "\n").split(/\n[\t ]*\n/);
      paragraphs.forEach((text, index) => {
        if (index > 0) flush();
        if (text) paragraph.push({ kind: "text", text });
      });
    }
  }
  flush();
  return blocks;
}

function Formula({ text, display }: { text: string; display: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(text, {
        displayMode: display,
        output: "htmlAndMathml",
        trust: false,
        throwOnError: false,
        strict: "ignore",
        maxExpand: 1000,
        maxSize: 10,
      });
    } catch {
      return null;
    }
  }, [text, display]);
  const Tag = display ? "div" : "span";
  const className = cn(
    "max-w-full overflow-x-auto overflow-y-hidden rounded-sm text-inherit outline-none focus-visible:ring-2 focus-visible:ring-ring [&_.katex]:text-[1.08em] [&_.katex]:text-inherit",
    display
      ? "min-w-0 py-3 [&_.katex-display]:m-0 [&_.katex-display]:text-left [&_.katex-display>.katex]:text-left"
      : "inline-block align-middle px-0.5 py-1",
  );
  if (html === null) {
    return <Tag className={className}>{display ? "$$" : "$"}{text}{display ? "$$" : "$"}</Tag>;
  }
  return (
    <Tag
      className={className}
      tabIndex={0}
      role="group"
      aria-label={display ? "独立公式（可横向滚动）" : "行内公式（可横向滚动）"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function MathText({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseMath(text), [text]);
  return (
    <div data-solution-source={text} className={cn("min-w-0 max-w-full space-y-2 text-[13px] leading-[1.9] text-inherit", className)}>
      {blocks.map((block, index) => block.kind === "display" ? (
        <Formula key={index} text={block.text} display />
      ) : (
        <p
          key={index}
          className={cn(
            "m-0 min-w-0 max-w-full [overflow-wrap:anywhere]",
            block.parts[0]?.kind === "text" && /^[①②]/.test(block.parts[0].text.trimStart()) && "pt-3 text-sm font-semibold first:pt-0",
          )}
        >
          {block.parts.map((part, partIndex) => part.kind === "inline" ? (
            <Formula key={partIndex} text={part.text} display={false} />
          ) : (
            <span key={partIndex} className="whitespace-pre-wrap">{part.text}</span>
          ))}
        </p>
      ))}
    </div>
  );
}
