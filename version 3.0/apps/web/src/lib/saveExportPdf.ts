import type {
  PersistedComicPage,
  PersistedComicProject,
  SaveBundle,
  SavedGameRecord
} from "../../../../packages/shared-types/src/index.ts";
import {
  buildPdfBlobFromCanvases,
  createExportCanvas,
  downloadBlob,
  drawImageContain,
  EXPORT_CANVAS_HEIGHT,
  EXPORT_CANVAS_WIDTH,
  loadImageElement,
  paintExportCanvasBackground,
  wrapCanvasText
} from "./browserPdf.ts";
import {
  buildCombinedComicExportSegments,
  buildCombinedSegmentMessageLines,
  buildSaveBundleTextExport
} from "./saveExportText.ts";

const PAGE_MARGIN = 96;
const CONTENT_WIDTH = EXPORT_CANVAS_WIDTH - PAGE_MARGIN * 2;
const CONTENT_BOTTOM = EXPORT_CANVAS_HEIGHT - PAGE_MARGIN;

type TextStyle = {
  font: string;
  fillStyle: string;
  lineHeight: number;
  marginBottom: number;
};

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create canvas context.");
  }

  return context;
}

function sanitizeFileStem(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim() || "export";
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function drawCard(
  context: CanvasRenderingContext2D,
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }
): void {
  const radius = 28;
  context.save();
  context.fillStyle = "rgba(255, 252, 247, 0.88)";
  context.strokeStyle = "rgba(122, 50, 32, 0.16)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(bounds.x + radius, bounds.y);
  context.lineTo(bounds.x + bounds.width - radius, bounds.y);
  context.arcTo(
    bounds.x + bounds.width,
    bounds.y,
    bounds.x + bounds.width,
    bounds.y + radius,
    radius
  );
  context.lineTo(bounds.x + bounds.width, bounds.y + bounds.height - radius);
  context.arcTo(
    bounds.x + bounds.width,
    bounds.y + bounds.height,
    bounds.x + bounds.width - radius,
    bounds.y + bounds.height,
    radius
  );
  context.lineTo(bounds.x + radius, bounds.y + bounds.height);
  context.arcTo(
    bounds.x,
    bounds.y + bounds.height,
    bounds.x,
    bounds.y + bounds.height - radius,
    radius
  );
  context.lineTo(bounds.x, bounds.y + radius);
  context.arcTo(bounds.x, bounds.y, bounds.x + radius, bounds.y, radius);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function drawPageHeader(
  context: CanvasRenderingContext2D,
  title: string,
  subtitle?: string
): number {
  let y = PAGE_MARGIN;
  context.save();
  context.fillStyle = "#7a3220";
  context.font = "600 18px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  context.fillText("AI TRPG EXPORT", PAGE_MARGIN, y);
  context.restore();
  y += 36;

  context.save();
  context.fillStyle = "#2f241b";
  context.font = "700 48px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  for (const line of wrapCanvasText(context, title, CONTENT_WIDTH)) {
    context.fillText(line, PAGE_MARGIN, y);
    y += 58;
  }
  context.restore();

  if (subtitle?.trim()) {
    context.save();
    context.fillStyle = "#6f5a47";
    context.font = "400 24px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    for (const line of wrapCanvasText(context, subtitle, CONTENT_WIDTH)) {
      context.fillText(line, PAGE_MARGIN, y);
      y += 34;
    }
    context.restore();
    y += 10;
  }

  return y;
}

function drawPageFooter(
  context: CanvasRenderingContext2D,
  label: string,
  pageNumber: number
): void {
  context.save();
  context.fillStyle = "rgba(111, 90, 71, 0.9)";
  context.font = "400 20px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  context.fillText(label, PAGE_MARGIN, EXPORT_CANVAS_HEIGHT - 42);
  const pageText = `Page ${pageNumber}`;
  const width = context.measureText(pageText).width;
  context.fillText(pageText, EXPORT_CANVAS_WIDTH - PAGE_MARGIN - width, EXPORT_CANVAS_HEIGHT - 42);
  context.restore();
}

function createBasePage(
  footerLabel: string,
  pageNumber: number,
  options?: {
    accentStrength?: number;
  }
): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  y: number;
} {
  const canvas = createExportCanvas();
  const context = getCanvasContext(canvas);
  paintExportCanvasBackground(context, options);
  drawPageFooter(context, footerLabel, pageNumber);

  return {
    canvas,
    context,
    y: PAGE_MARGIN
  };
}

function buildExportFileStem(record: SavedGameRecord): string {
  const savedAt = record.savedAt.replace(/[:/\\]/g, "-").replace(/\..*$/u, "");
  return sanitizeFileStem(`${record.storyTitle}_${savedAt}_${record.saveId}`);
}

function downloadTextFile(fileName: string, content: string): void {
  downloadBlob(
    new Blob(["\uFEFF", content], {
      type: "text/plain; charset=utf-8"
    }),
    fileName
  );
}

function buildCoverMetaLines(record: SavedGameRecord, saveBundle: SaveBundle): string[] {
  return [
    `规则：${record.ruleTitle}`,
    `剧本：${record.storyTitle}`,
    `回合：${record.round}`,
    `状态：${record.status}`,
    `存档时间：${formatTimestamp(saveBundle.savedAt)}`,
    `世界线：${record.worldlineId?.trim() || "未关联"}`
  ];
}

function renderCoverPage(
  title: string,
  subtitle: string,
  metaLines: string[]
): HTMLCanvasElement {
  const { canvas, context } = createBasePage(subtitle, 1, {
    accentStrength: 0.18
  });
  let y = drawPageHeader(context, title, subtitle) + 30;

  drawCard(context, {
    x: PAGE_MARGIN,
    y,
    width: CONTENT_WIDTH,
    height: 420
  });

  y += 72;
  context.save();
  context.fillStyle = "#7a3220";
  context.font = "600 22px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  context.fillText("导出信息", PAGE_MARGIN + 42, y);
  context.restore();
  y += 56;

  context.save();
  context.fillStyle = "#2f241b";
  context.font = "400 28px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  for (const line of metaLines) {
    context.fillText(line, PAGE_MARGIN + 42, y);
    y += 52;
  }
  context.restore();

  return canvas;
}

function getTextStyle(kind: "section" | "speaker" | "body"): TextStyle {
  switch (kind) {
    case "section":
      return {
        font: "700 30px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        fillStyle: "#7a3220",
        lineHeight: 40,
        marginBottom: 18
      };
    case "speaker":
      return {
        font: "600 24px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        fillStyle: "#4a3426",
        lineHeight: 34,
        marginBottom: 8
      };
    case "body":
    default:
      return {
        font: "400 24px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        fillStyle: "#2f241b",
        lineHeight: 40,
        marginBottom: 18
      };
  }
}

function renderTextSectionPages(input: {
  documentLabel: string;
  pageNumberStart: number;
  title: string;
  subtitle: string;
  lines: string[];
}): HTMLCanvasElement[] {
  const pages: HTMLCanvasElement[] = [];
  let pageNumber = input.pageNumberStart;
  let pageState = createBasePage(input.documentLabel, pageNumber);
  let y = drawPageHeader(pageState.context, input.title, input.subtitle) + 18;

  pages.push(pageState.canvas);

  const startNewPage = () => {
    pageNumber += 1;
    pageState = createBasePage(input.documentLabel, pageNumber);
    pages.push(pageState.canvas);
    y = drawPageHeader(pageState.context, `${input.title}（续）`, input.subtitle) + 18;
  };

  for (const rawLine of input.lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      y += 18;
      continue;
    }

    const kind =
      /^【.+】$/u.test(trimmed) ? "section" : trimmed.endsWith(":") ? "speaker" : "body";
    const style = getTextStyle(kind);
    pageState.context.save();
    pageState.context.font = style.font;
    pageState.context.fillStyle = style.fillStyle;
    const wrappedLines = wrapCanvasText(pageState.context, trimmed, CONTENT_WIDTH);
    pageState.context.restore();

    for (const wrappedLine of wrappedLines) {
      if (y + style.lineHeight > CONTENT_BOTTOM) {
        startNewPage();
      }

      pageState.context.save();
      pageState.context.font = style.font;
      pageState.context.fillStyle = style.fillStyle;
      pageState.context.fillText(wrappedLine, PAGE_MARGIN, y);
      pageState.context.restore();
      y += style.lineHeight;
    }

    y += style.marginBottom;
  }

  return pages;
}

async function renderComicImagePage(input: {
  page: PersistedComicPage;
  documentLabel: string;
  pageNumber: number;
}): Promise<HTMLCanvasElement> {
  const { canvas, context } = createBasePage(input.documentLabel, input.pageNumber);
  const label = `漫画 ${input.page.pageNumber}`;
  let y = drawPageHeader(
    context,
    label,
    `生成时间：${formatTimestamp(input.page.createdAt)}`
  );

  const cardY = y + 16;
  const cardHeight = EXPORT_CANVAS_HEIGHT - cardY - PAGE_MARGIN;
  drawCard(context, {
    x: PAGE_MARGIN,
    y: cardY,
    width: CONTENT_WIDTH,
    height: cardHeight
  });

  const image = await loadImageElement(input.page.image.apiPath);
  drawImageContain(context, image, {
    x: PAGE_MARGIN + 28,
    y: cardY + 28,
    width: CONTENT_WIDTH - 56,
    height: cardHeight - 56
  });

  return canvas;
}

function renderComicPlaceholderPage(input: {
  title: string;
  subtitle: string;
  message: string;
  documentLabel: string;
  pageNumber: number;
}): HTMLCanvasElement {
  const { canvas, context } = createBasePage(input.documentLabel, input.pageNumber);
  let y = drawPageHeader(context, input.title, input.subtitle) + 24;

  drawCard(context, {
    x: PAGE_MARGIN,
    y,
    width: CONTENT_WIDTH,
    height: 620
  });

  context.save();
  context.fillStyle = "#7a3220";
  context.font = "600 28px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  context.fillText("当前没有可嵌入的漫画页", PAGE_MARGIN + 42, y + 72);
  context.restore();

  context.save();
  context.fillStyle = "#4a3426";
  context.font = "400 24px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  let lineY = y + 132;
  for (const line of wrapCanvasText(context, input.message, CONTENT_WIDTH - 84)) {
    context.fillText(line, PAGE_MARGIN + 42, lineY);
    lineY += 40;
  }
  context.restore();

  return canvas;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to convert blob to data URL."));
    reader.readAsDataURL(blob);
  });
}

async function fetchResourceAsDataUrl(resourceUrl: string): Promise<string> {
  const response = await fetch(resourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to load embedded asset: HTTP ${response.status}`);
  }

  return blobToDataUrl(await response.blob());
}

function buildStandaloneHtmlDocument(input: {
  title: string;
  subtitle: string;
  eyebrow: string;
  summaryLines: string[];
  bodyHtml: string;
}): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5eee5;
        --panel: rgba(255, 250, 244, 0.94);
        --panel-border: rgba(122, 50, 32, 0.16);
        --text: #2f241b;
        --muted: #6f5a47;
        --accent: #7a3220;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        background:
          radial-gradient(circle at top left, rgba(174, 111, 77, 0.2), transparent 30%),
          linear-gradient(160deg, #efe7dd 0%, #f7f3ed 48%, #ede5da 100%);
        color: var(--text);
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }

      body {
        padding: 18px;
      }

      .export-shell {
        width: min(100%, 980px);
        margin: 0 auto;
        display: grid;
        gap: 18px;
      }

      .hero-card,
      .section-card {
        border-radius: 22px;
        border: 1px solid var(--panel-border);
        background: var(--panel);
        box-shadow: 0 18px 40px rgba(44, 23, 18, 0.08);
      }

      .hero-card {
        padding: 24px;
        display: grid;
        gap: 14px;
      }

      .section-card {
        padding: 18px;
        display: grid;
        gap: 16px;
      }

      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--accent);
      }

      h1, h2, h3, p {
        margin: 0;
      }

      h1 {
        font-size: clamp(28px, 4.4vw, 42px);
        line-height: 1.14;
      }

      h2 {
        font-size: clamp(24px, 3.5vw, 34px);
        line-height: 1.18;
      }

      .hero-subtitle,
      .meta-line,
      .section-subtitle,
      .story-line-body,
      .placeholder-copy {
        color: var(--muted);
        line-height: 1.72;
      }

      .hero-meta {
        display: grid;
        gap: 8px;
      }

      .comic-image {
        display: block;
        width: 100%;
        height: auto;
        border-radius: 18px;
        border: 1px solid rgba(122, 50, 32, 0.12);
        background: rgba(255, 255, 255, 0.72);
      }

      .story-block {
        display: grid;
        gap: 10px;
      }

      .story-line-section {
        color: var(--accent);
        font-weight: 700;
      }

      .story-line-speaker {
        color: #4a3426;
        font-weight: 700;
      }

      .story-line-body {
        white-space: pre-wrap;
      }

      .placeholder-card {
        padding: 18px;
        border-radius: 18px;
        border: 1px dashed rgba(122, 50, 32, 0.28);
        background: rgba(255, 249, 243, 0.78);
        display: grid;
        gap: 10px;
      }

      @media (max-width: 720px) {
        body {
          padding: 10px;
        }

        .hero-card,
        .section-card {
          border-radius: 18px;
        }
      }
    </style>
  </head>
  <body>
    <main class="export-shell">
      <section class="hero-card">
        <div class="eyebrow">${escapeHtml(input.eyebrow)}</div>
        <h1>${escapeHtml(input.title)}</h1>
        <p class="hero-subtitle">${escapeHtml(input.subtitle)}</p>
        <div class="hero-meta">
          ${input.summaryLines
            .map((line) => `<div class="meta-line">${escapeHtml(line)}</div>`)
            .join("")}
        </div>
      </section>
      ${input.bodyHtml}
    </main>
  </body>
</html>`;
}

async function buildComicHtmlBody(comicProject: PersistedComicProject): Promise<string> {
  const sections = await Promise.all(
    comicProject.pages.map(async (page) => {
      try {
        const imageUrl = await fetchResourceAsDataUrl(page.image.apiPath);
        return `<article class="section-card">
          <div class="eyebrow">Comic Page ${page.pageNumber}</div>
          <h2>漫画 ${page.pageNumber}</h2>
          <p class="section-subtitle">生成时间：${escapeHtml(formatTimestamp(page.createdAt))}</p>
          <img class="comic-image" alt="${escapeHtml(`漫画 ${page.pageNumber}`)}" src="${imageUrl}" />
        </article>`;
      } catch (error) {
        return `<article class="section-card">
          <div class="eyebrow">Comic Page ${page.pageNumber}</div>
          <h2>漫画 ${page.pageNumber}</h2>
          <div class="placeholder-card">
            <div class="story-line-speaker">这张漫画页没能嵌入到单文件导出里。</div>
            <div class="placeholder-copy">${escapeHtml(
              error instanceof Error ? error.message : String(error)
            )}</div>
          </div>
        </article>`;
      }
    })
  );

  return sections.join("\n");
}

function renderCombinedStoryLines(lines: string[]): string {
  return `<div class="story-block">
    ${lines
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const trimmed = line.trim();
        if (/^【.+】$/u.test(trimmed)) {
          return `<div class="story-line-section">${escapeHtml(trimmed)}</div>`;
        }

        if (trimmed.endsWith(":")) {
          return `<div class="story-line-speaker">${escapeHtml(trimmed)}</div>`;
        }

        return `<div class="story-line-body">${escapeHtml(trimmed)}</div>`;
      })
      .join("")}
  </div>`;
}

async function buildCombinedHtmlBody(
  record: SavedGameRecord,
  saveBundle: SaveBundle,
  comicProject: PersistedComicProject | null
): Promise<string> {
  const segments = buildCombinedComicExportSegments(saveBundle, comicProject);
  const pagesByNumber = new Map((comicProject?.pages ?? []).map((page) => [page.pageNumber, page]));
  const sections = await Promise.all(
    segments.map(async (segment) => {
      const comicPage = segment.comicPageNumber
        ? pagesByNumber.get(segment.comicPageNumber) ?? null
        : null;
      let comicHtml = `<div class="placeholder-card">
        <div class="story-line-speaker">这一段当前没有对应漫画页。</div>
        <div class="placeholder-copy">如果后面补生成了对应世界线漫画，再导出一次就会自动带上。</div>
      </div>`;

      if (comicPage) {
        try {
          const imageUrl = await fetchResourceAsDataUrl(comicPage.image.apiPath);
          comicHtml = `<img class="comic-image" alt="${escapeHtml(
            `${record.storyTitle} 漫画 ${comicPage.pageNumber}`
          )}" src="${imageUrl}" />`;
        } catch (error) {
          comicHtml = `<div class="placeholder-card">
            <div class="story-line-speaker">对应漫画页存在，但当前没能嵌入导出文件。</div>
            <div class="placeholder-copy">${escapeHtml(
              error instanceof Error ? error.message : String(error)
            )}</div>
          </div>`;
        }
      }

      return `<article class="section-card">
        <div class="eyebrow">${escapeHtml(
          segment.comicPageNumber ? `Comic ${segment.comicPageNumber}` : "Story Segment"
        )}</div>
        <h2>${escapeHtml(segment.title)}</h2>
        <p class="section-subtitle">${escapeHtml(segment.subtitle)}</p>
        ${renderCombinedStoryLines(buildCombinedSegmentMessageLines(saveBundle, segment))}
        ${comicHtml}
      </article>`;
    })
  );

  return sections.join("\n");
}

export function exportSaveBundleText(record: SavedGameRecord, saveBundle: SaveBundle): void {
  const content = buildSaveBundleTextExport(
    saveBundle,
    record.storagePath?.trim() || `${record.saveId}.json`
  );
  downloadTextFile(`${buildExportFileStem(record)}.txt`, content);
}

export async function exportComicPdf(
  record: SavedGameRecord,
  saveBundle: SaveBundle,
  comicProject: PersistedComicProject
): Promise<void> {
  if (comicProject.pages.length === 0) {
    throw new Error("当前没有可导出的漫画页。");
  }

  const canvases: HTMLCanvasElement[] = [
    renderCoverPage("世界线漫画导出", record.storyTitle, [
      ...buildCoverMetaLines(record, saveBundle),
      `漫画页数：${comicProject.pages.length}`
    ])
  ];

  for (let index = 0; index < comicProject.pages.length; index += 1) {
    const page = comicProject.pages[index];
    try {
      canvases.push(
        await renderComicImagePage({
          page,
          documentLabel: `${record.storyTitle} / 世界线漫画`,
          pageNumber: canvases.length + 1
        })
      );
    } catch (error) {
      canvases.push(
        renderComicPlaceholderPage({
          title: `漫画 ${page.pageNumber}`,
          subtitle: `生成时间：${formatTimestamp(page.createdAt)}`,
          message: error instanceof Error ? error.message : String(error),
          documentLabel: `${record.storyTitle} / 世界线漫画`,
          pageNumber: canvases.length + 1
        })
      );
    }
  }

  downloadBlob(
    buildPdfBlobFromCanvases(canvases),
    `${buildExportFileStem(record)}_comics.pdf`
  );
}

export async function exportComicHtml(
  record: SavedGameRecord,
  saveBundle: SaveBundle,
  comicProject: PersistedComicProject
): Promise<void> {
  if (comicProject.pages.length === 0) {
    throw new Error("当前没有可导出的漫画页。");
  }

  const html = buildStandaloneHtmlDocument({
    title: `${record.storyTitle}：世界线漫画`,
    subtitle: "单文件 HTML 导出，适合浏览器、手机和桌面端连续阅读。",
    eyebrow: "AI TRPG Comic Export",
    summaryLines: [
      ...buildCoverMetaLines(record, saveBundle),
      `漫画页数：${comicProject.pages.length}`
    ],
    bodyHtml: await buildComicHtmlBody(comicProject)
  });

  downloadBlob(
    new Blob([html], {
      type: "text/html; charset=utf-8"
    }),
    `${buildExportFileStem(record)}_comics.html`
  );
}

export async function exportCombinedStoryComicPdf(
  record: SavedGameRecord,
  saveBundle: SaveBundle,
  comicProject: PersistedComicProject | null
): Promise<void> {
  const segments = buildCombinedComicExportSegments(saveBundle, comicProject);
  const documentLabel = `${record.storyTitle} / 文本 + 漫画`;
  const canvases: HTMLCanvasElement[] = [
    renderCoverPage("文本与漫画对应导出", record.storyTitle, [
      ...buildCoverMetaLines(record, saveBundle),
      `文本分段：${segments.length}`,
      `已找到漫画页：${comicProject?.pages.length ?? 0}`
    ])
  ];

  for (const segment of segments) {
    canvases.push(
      ...renderTextSectionPages({
        documentLabel,
        pageNumberStart: canvases.length + 1,
        title: segment.title,
        subtitle: segment.subtitle,
        lines: buildCombinedSegmentMessageLines(saveBundle, segment)
      })
    );

    const comicPage =
      comicProject?.pages.find((page) => page.pageNumber === segment.comicPageNumber) ?? null;
    if (!comicPage) {
      canvases.push(
        renderComicPlaceholderPage({
          title: `${segment.title} / 对应漫画`,
          subtitle: segment.subtitle,
          message: "这一段当前还没有生成对应漫画页，所以这里保留了占位说明。",
          documentLabel,
          pageNumber: canvases.length + 1
        })
      );
      continue;
    }

    try {
      canvases.push(
        await renderComicImagePage({
          page: comicPage,
          documentLabel,
          pageNumber: canvases.length + 1
        })
      );
    } catch (error) {
      canvases.push(
        renderComicPlaceholderPage({
          title: `${segment.title} / 对应漫画`,
          subtitle: `漫画 ${comicPage.pageNumber}`,
          message: error instanceof Error ? error.message : String(error),
          documentLabel,
          pageNumber: canvases.length + 1
        })
      );
    }
  }

  downloadBlob(
    buildPdfBlobFromCanvases(canvases),
    `${buildExportFileStem(record)}_story_comic.pdf`
  );
}

export async function exportCombinedStoryComicHtml(
  record: SavedGameRecord,
  saveBundle: SaveBundle,
  comicProject: PersistedComicProject | null
): Promise<void> {
  const html = buildStandaloneHtmlDocument({
    title: `${record.storyTitle}：文本与漫画对应导出`,
    subtitle: "单文件 HTML 导出，文本和漫画按段连续排布，不会被分页切开。",
    eyebrow: "AI TRPG Story + Comic Export",
    summaryLines: [
      ...buildCoverMetaLines(record, saveBundle),
      `已找到漫画页：${comicProject?.pages.length ?? 0}`
    ],
    bodyHtml: await buildCombinedHtmlBody(record, saveBundle, comicProject)
  });

  downloadBlob(
    new Blob([html], {
      type: "text/html; charset=utf-8"
    }),
    `${buildExportFileStem(record)}_story_comic.html`
  );
}
