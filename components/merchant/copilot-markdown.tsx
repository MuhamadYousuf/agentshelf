import type { ReactNode } from "react";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g);
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={key}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("*") && token.endsWith("*")) {
      return <em key={key}>{token.slice(1, -1)}</em>;
    }
    return token;
  });
}

function isBullet(line: string): boolean {
  return /^\s*[-*]\s+/.test(line);
}

/** Renders a small, safe Markdown subset. All other model output stays text. */
export function CopilotMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    while (index < lines.length && !lines[index]?.trim()) index += 1;
    if (index >= lines.length) break;

    if (isBullet(lines[index] ?? "")) {
      const items: ReactNode[] = [];
      while (index < lines.length && isBullet(lines[index] ?? "")) {
        const line = lines[index] ?? "";
        items.push(<li key={`item-${index}`}>{renderInline(line.replace(/^\s*[-*]\s+/, ""), `item-${index}`)}</li>);
        index += 1;
      }
      blocks.push(<ul key={`list-${index}`}>{items}</ul>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index]?.trim() && !isBullet(lines[index] ?? "")) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${index}`}>
        {paragraph.map((line, lineIndex) => (
          <span key={`line-${lineIndex}`}>
            {lineIndex > 0 ? <br /> : null}
            {renderInline(line, `paragraph-${index}-${lineIndex}`)}
          </span>
        ))}
      </p>,
    );
  }

  return <div className="copilot-rich-text">{blocks}</div>;
}
