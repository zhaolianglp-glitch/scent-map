import { useState, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { MapContainer } from './components/MapContainer';
import { ScentInputModal } from './components/ScentInputModal';
import type { SmellPoint } from './data/mockSmells';
import type { OKLCH } from './utils/oklch';
import { MOCK_SMELLS } from './data/mockSmells';

interface ClickPos {
  lng: number;
  lat: number;
  x: number;
  y: number;
}

export default function App() {
  const [smells, setSmells] = useState<SmellPoint[]>(MOCK_SMELLS);
  const [clickPos, setClickPos] = useState<ClickPos | null>(null);
  const clickPosRef = useRef<ClickPos | null>(null);

  const handleMapClick = useCallback((pos: ClickPos) => {
    clickPosRef.current = pos;
    setClickPos(pos);
  }, []);

  const handleCloseModal = useCallback(() => {
    setClickPos(null);
  }, []);

  const handleAddSmell = useCallback((keyword: string, oklch: OKLCH) => {
    const pos = clickPosRef.current;
    if (!pos) return;
    setClickPos(null);

    const newSmell: SmellPoint = {
      id: `smell-custom-${Date.now()}`,
      position: [pos.lng, pos.lat],
      keyword,
      oklch,
      intensity: 0.8,
      age: 1,
      size: 70,
      phase: Math.random() * Math.PI * 2,
      avatar: '👤',
      username: '我',
      message: `我闻到了${keyword}的味道`,
    };
    setSmells(prev => [...prev, newSmell]);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <Header />
      <MapContainer
        smells={smells}
        onMapClick={handleMapClick}
      />
      {clickPos && (
        <ScentInputModal
          center={{ x: clickPos.x, y: clickPos.y }}
          onClose={handleCloseModal}
          onConfirm={handleAddSmell}
        />
      )}
    </div>
  );
}