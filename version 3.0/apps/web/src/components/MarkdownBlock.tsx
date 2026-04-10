import { Fragment, type ReactNode } from "react";

type MarkdownBlockProps = {
  content: string;
  className?: string;
};

type MarkdownBlockItem =
  | {
      type: "heading";
      level: 1 | 2 | 3;
      content: string;
    }
  | {
      type: "paragraph";
      content: string;
    }
  | {
      type: "list";
      items: string[];
    };

function pushParagraph(
  blocks: MarkdownBlockItem[],
  paragraphLines: string[]
): void {
  if (paragraphLines.length === 0) {
    return;
  }

  blocks.push({
    type: "paragraph",
    content: paragraphLines.join(" ")
  });
  paragraphLines.length = 0;
}

function parseMarkdownBlocks(content: string): MarkdownBlockItem[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const blocks: MarkdownBlockItem[] = [];
  const paragraphLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";

    if (!line) {
      pushParagraph(blocks, paragraphLines);
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/u);
    if (headingMatch) {
      pushParagraph(blocks, paragraphLines);
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3,
        content: headingMatch[2]
      });
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/u);
    if (listMatch) {
      pushParagraph(blocks, paragraphLines);
      const items = [listMatch[1]];

      while (index + 1 < lines.length) {
        const nextLine = lines[index + 1]?.trim() ?? "";
        const nextItemMatch = nextLine.match(/^[-*]\s+(.+)$/u);
        if (!nextItemMatch) {
          break;
        }
        items.push(nextItemMatch[1]);
        index += 1;
      }

      blocks.push({
        type: "list",
        items
      });
      continue;
    }

    paragraphLines.push(line);
  }

  pushParagraph(blocks, paragraphLines);
  return blocks;
}

function renderInlineMarkdown(content: string, keyPrefix: string): ReactNode[] {
  const tokens = content.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/gu);

  return tokens
    .filter((token) => token.length > 0)
    .map((token, index) => {
      const key = `${keyPrefix}-${index}`;

      if (token.startsWith("**") && token.endsWith("**")) {
        return <strong key={key}>{token.slice(2, -2)}</strong>;
      }

      if (token.startsWith("`") && token.endsWith("`")) {
        return <code key={key}>{token.slice(1, -1)}</code>;
      }

      if (token.startsWith("*") && token.endsWith("*")) {
        return <em key={key}>{token.slice(1, -1)}</em>;
      }

      return <Fragment key={key}>{token}</Fragment>;
    });
}

export function MarkdownBlock(props: MarkdownBlockProps) {
  const { content, className } = props;
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;

        if (block.type === "heading") {
          if (block.level === 1) {
            return (
              <h3 key={key}>
                {renderInlineMarkdown(block.content, key)}
              </h3>
            );
          }

          return (
            <h4 key={key}>
              {renderInlineMarkdown(block.content, key)}
            </h4>
          );
        }

        if (block.type === "list") {
          return (
            <ul key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>
                  {renderInlineMarkdown(item, `${key}-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={key}>
            {renderInlineMarkdown(block.content, key)}
          </p>
        );
      })}
    </div>
  );
}
