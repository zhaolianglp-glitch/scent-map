// ClickHint: 引导用户点击地图标记气味 + 实时显示已添加气味数
import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useMapStore';

export function ClickHint() {
  const userSmellsCount = useAppStore((s) => s.userSmells.length);
  const [show, setShow] = useState(true);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    // 已经有用户气味了 → 淡出引导，但保留计数显示
    if (userSmellsCount > 0) {
      setOpacity(0.4);
    } else {
      setOpacity(1);
    }
  }, [userSmellsCount]);

  if (!show) return null;

  return (
    <div
      className="absolute bottom-32 left-8 z-20 pointer-events-none select-none transition-opacity duration-700"
      style={{ opacity }}
    >
      {userSmellsCount === 0 ? (
        <div className="flex items-center gap-2.5">
          <div className="relative w-2 h-2">
            <div
              className="absolute inset-0 rounded-full animate-ping"
              style={{ background: 'oklch(0.55 0.12 220)' }}
            />
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: 'oklch(0.55 0.12 220)' }}
            />
          </div>
          <div
            className="text-sm font-serif"
            style={{ color: 'oklch(0.3 0.04 240 / 0.85)', letterSpacing: '0.05em' }}
          >
            点击地图任意位置
          </div>
          <div
            className="text-sm font-serif italic"
            style={{ color: 'oklch(0.3 0.04 240 / 0.55)' }}
          >
            标记你闻到的气味
          </div>
        </div>
      ) : (
        <div
          className="text-sm font-mono"
          style={{ color: 'oklch(0.3 0.04 240 / 0.7)', letterSpacing: '0.08em' }}
        >
          · 已标记 {userSmellsCount} 个气味 ·
        </div>
      )}
    </div>
  );
}
