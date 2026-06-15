// SmellCanvas: 优雅的"水滴"气味可视化
// 核心：每个气味渲染 3 层（halo + teardrop + core），不用 trail buffer
// 1. Halo — 大柔和圆（无方向，氛围）
// 2. Teardrop — 沿风向的贝塞尔曲线水滴（拖尾）
// 3. Core — 小亮圆点（源头）
// 所有层缓慢呼吸 + 微微扰动
// 不同气味 personality 不同（尺寸/长度/呼吸速率/色相）
import { useEffect, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { MOCK_SMELLS, type SmellPoint } from '../data/mockSmells';
import { oklchToRgb255 } from '../utils/oklch';
import { useAppStore } from '../store/useMapStore';

interface Personality {
  haloScale: number;     // 0.8 - 1.3
  trailLength: number;   // 0.5 - 1.6
  trailWidth: number;    // 0.7 - 1.3
  wobbleAmp: number;     // 0.0 - 1.0
  breathRate: number;    // 0.18 - 0.45 (慢)
  coreSize: number;      // 0.8 - 1.2
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h) + id.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getPersonality(s: SmellPoint): Personality {
  const h = hashId(s.id + s.keyword);
  return {
    haloScale: 0.8 + ((h % 1000) / 1000) * 0.5,
    trailLength: 0.5 + (((h >> 10) % 1000) / 1000) * 1.1,
    trailWidth: 0.7 + (((h >> 20) % 1000) / 1000) * 0.6,
    wobbleAmp: (((h >> 30) % 1000) / 1000),
    breathRate: 0.18 + (((h >> 40) % 1000) / 1000) * 0.27,
    coreSize: 0.8 + (((h >> 50) % 1000) / 1000) * 0.4,
  };
}

interface SmellCanvasProps {
  map: MapLibreMap | null;
}

export function SmellCanvas({ map }: SmellCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { windSpeed, windDirAngle } = useAppStore();

  useEffect(() => {
    if (!map || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = map.getCanvas().getBoundingClientRect();
      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(rect.height * dpr);
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    };
    resize();
    map.on('resize', resize);

    const startTime = performance.now();
    let animId = 0;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const t = (performance.now() - startTime) / 1000;

      const userSmells = useAppStore.getState().userSmells;
      const allSmells: SmellPoint[] = [...MOCK_SMELLS, ...userSmells];
      const lastClick = useAppStore.getState().lastClick;

      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, w, h);

      // 风向
      const rad = (windDirAngle * Math.PI) / 180;
      const windX = Math.cos(rad);
      const windY = Math.sin(rad);
      const perpX = -windY;
      const perpY = windX;
      const windAngle = Math.atan2(windY, windX);

      // === Layer 1: 外层光晕（大柔和圆，无方向，缓慢呼吸）===
      ctx.globalCompositeOperation = 'screen';
      for (const s of allSmells) {
        const personality = getPersonality(s);
        const screen = map.project(s.position);
        const sx = screen.x * dpr;
        const sy = screen.y * dpr;
        if (sx < -120 || sx > w + 120 || sy < -120 || sy > h + 120) continue;

        const [r, g, b] = oklchToRgb255(s.oklch.L, s.oklch.C, s.oklch.H);
        const ageFade = 0.4 + 0.6 * s.age;
        const baseAlpha = s.intensity * ageFade;

        const breath = 1 + 0.06 * Math.sin(t * personality.breathRate + s.phase);
        const haloR = 50 * personality.haloScale * s.intensity * dpr * breath;
        const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, haloR);
        halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${baseAlpha * 0.14})`);
        halo.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${baseAlpha * 0.08})`);
        halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
        ctx.fill();
      }

      // === Layer 2: 水滴拖尾（沿风向的贝塞尔曲线有机形状）===
      for (const s of allSmells) {
        const personality = getPersonality(s);
        const screen = map.project(s.position);
        const sx = screen.x * dpr;
        const sy = screen.y * dpr;
        if (sx < -150 || sx > w + 150 || sy < -150 || sy > h + 150) continue;

        const [r, g, b] = oklchToRgb255(s.oklch.L, s.oklch.C, s.oklch.H);
        const ageFade = 0.4 + 0.6 * s.age;
        const baseAlpha = s.intensity * ageFade;

        // 缓慢呼吸：长度和宽度独立呼吸
        const lenBreath = 1 + 0.1 * Math.sin(t * personality.breathRate * 0.8 + s.phase);
        const widBreath = 1 + 0.12 * Math.sin(t * personality.breathRate * 1.3 + s.phase + 1.5);
        const trailLen = (45 + windSpeed * 65) * personality.trailLength * dpr * lenBreath;
        const trailWid = 22 * personality.trailWidth * dpr * widBreath;

        // 垂直方向缓慢摆动
        const wobble = personality.wobbleAmp * 5 * Math.sin(t * 0.35 + s.phase) * dpr;

        ctx.save();
        ctx.translate(sx + perpX * wobble, sy + perpY * wobble);
        ctx.rotate(windAngle);

        // 线性渐变：从源头（满色）到尖端（透明）
        const grad = ctx.createLinearGradient(0, 0, trailLen, 0);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${baseAlpha * 0.32})`);
        grad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${baseAlpha * 0.20})`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        // 起点：源头（圆形端）
        ctx.moveTo(0, -trailWid);
        // 上边曲线到尖端
        ctx.bezierCurveTo(
          trailLen * 0.3, -trailWid * 1.15,
          trailLen * 0.7, -trailWid * 0.45,
          trailLen, 0
        );
        // 下边曲线回到源头
        ctx.bezierCurveTo(
          trailLen * 0.7, trailWid * 0.45,
          trailLen * 0.3, trailWid * 1.15,
          0, trailWid
        );
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }

      // === Layer 3: 核心（小亮圆点，极弱呼吸）===
      ctx.globalCompositeOperation = 'source-over';
      for (const s of allSmells) {
        const screen = map.project(s.position);
        const sx = screen.x * dpr;
        const sy = screen.y * dpr;
        if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) continue;

        const personality = getPersonality(s);
        const [r, g, b] = oklchToRgb255(s.oklch.L, s.oklch.C, s.oklch.H);
        const ageFade = 0.4 + 0.6 * s.age;
        const baseAlpha = s.intensity * ageFade;
        const breath = 1 + 0.04 * Math.sin(t * 0.31 + s.phase);
        const coreR = 5 * s.intensity * personality.coreSize * dpr * breath;
        const core = ctx.createRadialGradient(sx, sy, 0, sx, sy, coreR);
        core.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${Math.min(0.8, baseAlpha * 0.8)})`);
        core.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(sx, sy, coreR, 0, Math.PI * 2);
        ctx.fill();
      }

      // === Click ripple ===
      if (lastClick) {
        const clickT = (Date.now() - lastClick.t) / 1000;
        if (clickT < 2.0) {
          const clickScreen = map.project([lastClick.lng, lastClick.lat]);
          const cx = clickScreen.x * dpr;
          const cy = clickScreen.y * dpr;
          if (cx > -200 && cx < w + 200 && cy > -200 && cy < h + 200) {
            const ringT = clickT / 2.0;
            const ringR = (15 + ringT * 160) * dpr;
            const ringAlpha = (1 - ringT) * (1 - ringT) * 0.55;
            ctx.globalCompositeOperation = 'screen';
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(180, 200, 220, ${ringAlpha})`;
            ctx.lineWidth = 1.4 * dpr;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(draw);
    };

    const onLoad = () => draw();
    if (map.loaded()) onLoad();
    else map.once('load', onLoad);

    return () => {
      cancelAnimationFrame(animId);
      map.off('resize', resize);
    };
  }, [map, windSpeed, windDirAngle]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 15 }}
    />
  );
}
