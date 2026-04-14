const PDF_PAGE_WIDTH_POINTS = 595.28;
const PDF_PAGE_HEIGHT_POINTS = 841.89;

export const EXPORT_CANVAS_WIDTH = 1240;
export const EXPORT_CANVAS_HEIGHT = 1754;

type PdfJpegPage = {
  widthPx: number;
  heightPx: number;
  jpegBytes: Uint8Array;
};

function encoder() {
  return new TextEncoder();
}

function encodeText(value: string): Uint8Array {
  return encoder().encode(value);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }

  return output;
}

async function waitForImageDecode(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode === "function") {
    await image.decode();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    if (image.complete && image.naturalWidth > 0) {
      resolve();
      return;
    }

    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to decode image."));
  });
}

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.crossOrigin = "anonymous";
  image.src = src;
  await waitForImageDecode(image);
  return image;
}

export function createExportCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_CANVAS_WIDTH;
  canvas.height = EXPORT_CANVAS_HEIGHT;
  return canvas;
}

export function paintExportCanvasBackground(
  context: CanvasRenderingContext2D,
  options?: {
    accentStrength?: number;
  }
): void {
  const gradient = context.createLinearGradient(0, 0, EXPORT_CANVAS_WIDTH, EXPORT_CANVAS_HEIGHT);
  gradient.addColorStop(0, "#fbf5ee");
  gradient.addColorStop(0.52, "#f4ece1");
  gradient.addColorStop(1, "#efe4d7");
  context.fillStyle = gradient;
  context.fillRect(0, 0, EXPORT_CANVAS_WIDTH, EXPORT_CANVAS_HEIGHT);

  const radial = context.createRadialGradient(
    EXPORT_CANVAS_WIDTH * 0.12,
    EXPORT_CANVAS_HEIGHT * 0.08,
    20,
    EXPORT_CANVAS_WIDTH * 0.12,
    EXPORT_CANVAS_HEIGHT * 0.08,
    EXPORT_CANVAS_WIDTH * 0.7
  );
  radial.addColorStop(0, `rgba(122, 50, 32, ${options?.accentStrength ?? 0.14})`);
  radial.addColorStop(1, "rgba(122, 50, 32, 0)");
  context.fillStyle = radial;
  context.fillRect(0, 0, EXPORT_CANVAS_WIDTH, EXPORT_CANVAS_HEIGHT);
}

export function drawImageContain(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }
): void {
  const sourceWidth =
    image instanceof HTMLImageElement
      ? image.naturalWidth
      : image instanceof HTMLCanvasElement
        ? image.width
        : image instanceof ImageBitmap
          ? image.width
          : bounds.width;
  const sourceHeight =
    image instanceof HTMLImageElement
      ? image.naturalHeight
      : image instanceof HTMLCanvasElement
        ? image.height
        : image instanceof ImageBitmap
          ? image.height
          : bounds.height;
  const scale = Math.min(bounds.width / sourceWidth, bounds.height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = bounds.x + (bounds.width - drawWidth) / 2;
  const drawY = bounds.y + (bounds.height - drawHeight) / 2;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

export function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    let currentLine = "";
    for (const character of paragraph) {
      const candidate = currentLine + character;
      if (currentLine && context.measureText(candidate).width > maxWidth) {
        lines.push(currentLine.trimEnd());
        currentLine = character.trimStart();
        continue;
      }

      currentLine = candidate;
    }

    if (currentLine) {
      lines.push(currentLine.trimEnd());
    }
  }

  return lines;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1_000);
}

export function buildPdfFromJpegPages(pages: PdfJpegPage[]): Blob {
  if (pages.length === 0) {
    throw new Error("Cannot build a PDF without any pages.");
  }

  const header = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xff, 0xff, 0xff, 0xff, 0x0a
  ]);
  const objectOffsets: number[] = [0];
  const objectChunks: Uint8Array[] = [];
  let currentOffset = header.length;
  const objectCount = 2 + pages.length * 3;

  function pushObject(objectNumber: number, contentParts: Array<string | Uint8Array>): void {
    const body = concatBytes(
      contentParts.map((part) => (typeof part === "string" ? encodeText(part) : part))
    );
    const chunk = concatBytes([
      encodeText(`${objectNumber} 0 obj\n`),
      body,
      encodeText("\nendobj\n")
    ]);

    objectOffsets[objectNumber] = currentOffset;
    objectChunks.push(chunk);
    currentOffset += chunk.length;
  }

  const pageObjectNumbers = pages.map((_, index) => 5 + index * 3);

  pushObject(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  pushObject(2, [
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((objectNumber) => `${objectNumber} 0 R`).join(" ")}] /Count ${pages.length} >>`
  ]);

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const imageObjectNumber = 3 + index * 3;
    const contentObjectNumber = 4 + index * 3;
    const pageObjectNumber = 5 + index * 3;
    const imageName = `/Im${index + 1}`;
    const contentStream = `q\n${PDF_PAGE_WIDTH_POINTS} 0 0 ${PDF_PAGE_HEIGHT_POINTS} 0 0 cm\n${imageName} Do\nQ\n`;

    pushObject(imageObjectNumber, [
      `<< /Type /XObject /Subtype /Image /Width ${page.widthPx} /Height ${page.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>\nstream\n`,
      page.jpegBytes,
      "\nendstream"
    ]);
    pushObject(contentObjectNumber, [
      `<< /Length ${encodeText(contentStream).length} >>\nstream\n${contentStream}endstream`
    ]);
    pushObject(pageObjectNumber, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH_POINTS} ${PDF_PAGE_HEIGHT_POINTS}] /Resources << /XObject << ${imageName} ${imageObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
    ]);
  }

  const xrefOffset = currentOffset;
  const xrefLines = [
    `xref\n0 ${objectCount + 1}\n`,
    "0000000000 65535 f \n",
    ...Array.from({ length: objectCount }, (_, index) => {
      const objectNumber = index + 1;
      return `${String(objectOffsets[objectNumber] ?? 0).padStart(10, "0")} 00000 n \n`;
    }),
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\n`,
    `startxref\n${xrefOffset}\n%%EOF`
  ];

  return new Blob(
    [header, ...objectChunks, encodeText(xrefLines.join(""))],
    {
      type: "application/pdf"
    }
  );
}

export function canvasToJpegPage(canvas: HTMLCanvasElement): PdfJpegPage {
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/u, "");

  return {
    widthPx: canvas.width,
    heightPx: canvas.height,
    jpegBytes: base64ToBytes(base64)
  };
}

export function buildPdfBlobFromCanvases(canvases: HTMLCanvasElement[]): Blob {
  return buildPdfFromJpegPages(canvases.map((canvas) => canvasToJpegPage(canvas)));
}
