// 用户标记组件 — 缩放时在地图上显示头像 + 话语
import { useEffect, useState, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { SmellPoint } from '../data/mockSmells';

interface Props {
  map: maplibregl.Map | null;
  smells: SmellPoint[];
}

interface MarkerState {
  x: number;
  y: number;
  avatar: string;
  username: string;
  message: string;
  opacity: number;
}

export function UserMarkers({ map, smells }: Props) {
  const [markers, setMarkers] = useState<MarkerState[]>([]);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!map) return;

    const update = () => {
      const zoom = map.getZoom();
      // 只在 zoom >= 14 时显示用户信息
      const newMarkers: MarkerState[] = [];

      for (const s of smells) {
        const pos = maplibregl.MercatorCoordinate.fromLngLat({
          lng: s.position[0],
          lat: s.position[1],
        });
        const canvas = map.getCanvas();
        const pixel = map.project({ lng: s.position[0], lat: s.position[1] });

        // 检查是否在视口内
        if (pixel.x < -50 || pixel.x > canvas.width + 50 ||
            pixel.y < -50 || pixel.y > canvas.height + 50) continue;

        // 根据 zoom 计算透明度（14-16 之间渐变）
        const opacity = Math.max(0, Math.min(1, (zoom - 14) / 2));

        newMarkers.push({
          x: pixel.x,
          y: pixel.y,
          avatar: s.avatar,
          username: s.username,
          message: s.message,
          opacity,
        });
      }

      setMarkers(newMarkers);
      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [map, smells]);

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 10,
      overflow: 'hidden',
    }}>
      {markers.map((m, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: m.x,
            top: m.y,
            transform: 'translate(-50%, -50%)',
            opacity: m.opacity,
            transition: 'opacity 0.3s',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          {/* 头像 */}
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            lineHeight: 1,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            border: '1px solid rgba(0,0,0,0.06)',
          }}>
            {m.avatar}
          </div>

          {/* 用户名 */}
          <span style={{
            fontSize: 10,
            color: '#555',
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(4px)',
            padding: '1px 6px',
            borderRadius: 8,
            whiteSpace: 'nowrap',
            maxWidth: 100,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {m.username}
          </span>

          {/* 话语气泡 */}
          <div style={{
            maxWidth: 160,
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(8px)',
            borderRadius: 10,
            padding: '4px 8px',
            fontSize: 11,
            color: '#444',
            lineHeight: 1.4,
            textAlign: 'center',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.04)',
          }}>
            {m.message}
          </div>
        </div>
      ))}
    </div>
  );
}