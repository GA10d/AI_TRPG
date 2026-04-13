import { useEffect, useRef, type CSSProperties } from "react";

type CursorState = {
  x: number;
  y: number;
  lx: number;
  ly: number;
  sx: number;
  sy: number;
  v: number;
  vs: number;
  a: number;
  set: boolean;
};

type WavePoint = {
  x: number;
  y: number;
  wave: {
    x: number;
    y: number;
  };
  cursor: {
    x: number;
    y: number;
    vx: number;
    vy: number;
  };
};

type Bounds = {
  width: number;
  height: number;
  left: number;
  top: number;
};

class PerlinNoise2D {
  private readonly permutation: number[];

  constructor(seed: number) {
    const random = createSeededRandom(seed);
    const source = Array.from({ length: 256 }, (_, index) => index);

    for (let index = source.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      const current = source[index];
      source[index] = source[swapIndex];
      source[swapIndex] = current;
    }

    this.permutation = [...source, ...source];
  }

  perlin2(x: number, y: number): number {
    const xFloor = Math.floor(x) & 255;
    const yFloor = Math.floor(y) & 255;
    const xRelative = x - Math.floor(x);
    const yRelative = y - Math.floor(y);

    const u = fade(xRelative);
    const v = fade(yRelative);

    const aa = this.permutation[xFloor + this.permutation[yFloor]];
    const ab = this.permutation[xFloor + this.permutation[yFloor + 1]];
    const ba = this.permutation[xFloor + 1 + this.permutation[yFloor]];
    const bb = this.permutation[xFloor + 1 + this.permutation[yFloor + 1]];

    const x1 = lerp(
      grad(aa, xRelative, yRelative),
      grad(ba, xRelative - 1, yRelative),
      u
    );
    const x2 = lerp(
      grad(ab, xRelative, yRelative - 1),
      grad(bb, xRelative - 1, yRelative - 1),
      u
    );

    return lerp(x1, x2, v);
  }
}

function createSeededRandom(seed: number): () => number {
  let state = Math.floor(seed * 2147483647) || 1;

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function fade(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(start: number, end: number, amount: number): number {
  return start + amount * (end - start);
}

function grad(hash: number, x: number, y: number): number {
  switch (hash & 3) {
    case 0:
      return x + y;
    case 1:
      return -x + y;
    case 2:
      return x - y;
    default:
      return -x - y;
  }
}

export function WaveFieldBackground(): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const svg = svgRef.current;

    if (!host || !svg) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouse: CursorState = {
      x: -160,
      y: 0,
      lx: 0,
      ly: 0,
      sx: 0,
      sy: 0,
      v: 0,
      vs: 0,
      a: 0,
      set: false
    };

    const noise = new PerlinNoise2D(Math.random());
    let bounds: Bounds = {
      width: 0,
      height: 0,
      left: 0,
      top: 0
    };
    let lines: WavePoint[][] = [];
    let paths: SVGPathElement[] = [];
    let frameId = 0;

    function setMousePosition(clientX: number, clientY: number): void {
      mouse.x = clientX - bounds.left;
      mouse.y = clientY - bounds.top;

      if (!mouse.set) {
        mouse.sx = mouse.x;
        mouse.sy = mouse.y;
        mouse.lx = mouse.x;
        mouse.ly = mouse.y;
        mouse.set = true;
      }
    }

    function setSize(): void {
      const rect = host.getBoundingClientRect();
      bounds = {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top
      };

      svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    }

    function setLines(): void {
      const { width, height } = bounds;
      const xGap = 10;
      const yGap = 32;
      const overscanX = 220;
      const overscanY = 36;
      const lineCount = Math.ceil((width + overscanX) / xGap);
      const pointCount = Math.ceil((height + overscanY) / yGap);
      const xStart = (width - xGap * lineCount) / 2;
      const yStart = (height - yGap * pointCount) / 2;

      svg.replaceChildren();
      lines = [];
      paths = [];

      const fragment = document.createDocumentFragment();

      for (let lineIndex = 0; lineIndex <= lineCount; lineIndex += 1) {
        const points: WavePoint[] = [];

        for (let pointIndex = 0; pointIndex <= pointCount; pointIndex += 1) {
          points.push({
            x: xStart + xGap * lineIndex,
            y: yStart + yGap * pointIndex,
            wave: { x: 0, y: 0 },
            cursor: { x: 0, y: 0, vx: 0, vy: 0 }
          });
        }

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.classList.add("wave-field-line");
        fragment.appendChild(path);
        paths.push(path);
        lines.push(points);
      }

      svg.appendChild(fragment);
    }

    function movePoints(time: number): void {
      lines.forEach((points) => {
        points.forEach((point) => {
          const move =
            noise.perlin2(
              (point.x + time * 0.011) * 0.0019,
              (point.y + time * 0.0045) * 0.0014
            ) * 14;

          point.wave.x = Math.cos(move) * 34;
          point.wave.y = Math.sin(move) * 18;

          const dx = point.x - mouse.sx;
          const dy = point.y - mouse.sy;
          const distance = Math.hypot(dx, dy);
          const influence = Math.max(180, mouse.vs * 1.2);

          if (distance < influence) {
            const strength = 1 - distance / influence;
            const force = Math.cos(distance * 0.0095) * strength;

            point.cursor.vx += Math.cos(mouse.a) * force * influence * mouse.vs * 0.00058;
            point.cursor.vy += Math.sin(mouse.a) * force * influence * mouse.vs * 0.00058;
          }

          point.cursor.vx += (0 - point.cursor.x) * 0.005;
          point.cursor.vy += (0 - point.cursor.y) * 0.005;
          point.cursor.vx *= 0.925;
          point.cursor.vy *= 0.925;
          point.cursor.x += point.cursor.vx * 2;
          point.cursor.y += point.cursor.vy * 2;
          point.cursor.x = Math.min(100, Math.max(-100, point.cursor.x));
          point.cursor.y = Math.min(100, Math.max(-100, point.cursor.y));
        });
      });
    }

    function moved(point: WavePoint, withCursorForce = true): { x: number; y: number } {
      const x = point.x + point.wave.x + (withCursorForce ? point.cursor.x : 0);
      const y = point.y + point.wave.y + (withCursorForce ? point.cursor.y : 0);

      return {
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10
      };
    }

    function drawLines(): void {
      lines.forEach((points, lineIndex) => {
        const firstPoint = moved(points[0], false);
        let pathData = `M ${firstPoint.x} ${firstPoint.y}`;

        points.forEach((point, pointIndex) => {
          const isLastPoint = pointIndex === points.length - 1;
          const currentPoint = moved(point, !isLastPoint);
          pathData += ` L ${currentPoint.x} ${currentPoint.y}`;
        });

        paths[lineIndex]?.setAttribute("d", pathData);
      });
    }

    function renderFrame(time: number): void {
      if (!reduceMotion) {
        mouse.sx += (mouse.x - mouse.sx) * 0.1;
        mouse.sy += (mouse.y - mouse.sy) * 0.1;

        const dx = mouse.x - mouse.lx;
        const dy = mouse.y - mouse.ly;
        const velocity = Math.hypot(dx, dy);

        mouse.v = velocity;
        mouse.vs += (velocity - mouse.vs) * 0.1;
        mouse.vs = Math.min(100, mouse.vs);
        mouse.lx = mouse.x;
        mouse.ly = mouse.y;
        mouse.a = Math.atan2(dy, dx);
      }

      host.style.setProperty("--wave-cursor-x", `${mouse.sx}px`);
      host.style.setProperty("--wave-cursor-y", `${mouse.sy}px`);

      movePoints(reduceMotion ? 0 : time);
      drawLines();

      if (!reduceMotion) {
        frameId = window.requestAnimationFrame(renderFrame);
      }
    }

    function handleResize(): void {
      setSize();
      setLines();
      drawLines();
    }

    function handlePointerMove(event: PointerEvent): void {
      setMousePosition(event.clientX, event.clientY);
    }

    function handleTouchMove(event: TouchEvent): void {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      setMousePosition(touch.clientX, touch.clientY);
    }

    setSize();
    setLines();
    drawLines();

    window.addEventListener("resize", handleResize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });

    if (reduceMotion) {
      renderFrame(0);
    } else {
      frameId = window.requestAnimationFrame(renderFrame);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="wave-field-background"
      ref={hostRef}
      style={
        {
          "--wave-cursor-x": "-10px",
          "--wave-cursor-y": "50%"
        } as CSSProperties
      }
    >
      <svg className="wave-field-svg" ref={svgRef} />
    </div>
  );
}
