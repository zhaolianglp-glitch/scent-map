// MapContainer — 地图容器，管理 MapLibre 实例和 WebGL 气味层
import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SmellLayer } from '../layers/SmellLayer';
import { UserMarkers } from './UserMarkers';
import type { SmellPoint } from '../data/mockSmells';
import { HARBIN_CENTER, HARBIN_ZOOM } from '../data/mockSmells';

// OpenStreetMap 矢量风格（免费、专业、无需 API key）
const STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

interface Props {
  smells: SmellPoint[];
  onMapClick: (pos: { lng: number; lat: number; x: number; y: number }) => void;
}

export function MapContainer({ smells, onMapClick }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<SmellLayer | null>(null);

  // 初始化地图
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: HARBIN_CENTER,
      zoom: HARBIN_ZOOM,
      attributionControl: false,
      maxZoom: 18,
      minZoom: 9,
    });

    map.on('load', () => {
      const layer = new SmellLayer({
        smells,
        windSpeed: 0.45,
        windDir: [0.6, -0.8],
      });
      map.addLayer(layer);
      layerRef.current = layer;
    });

    // 点击地图弹出气味输入
    map.on('click', (e) => {
      const rect = map.getCanvas().getBoundingClientRect();
      onMapClick({
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        x: e.originalEvent.clientX,
        y: e.originalEvent.clientY,
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 气味数据变化时更新 layer
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.setSmells(smells);
    }
  }, [smells]);

  // 双击放大地图
  const handleDoubleClick = useCallback(() => {
    if (mapRef.current) {
      mapRef.current.zoomIn({ duration: 300 });
    }
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        ref={containerRef}
        onDoubleClick={handleDoubleClick}
        style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
      />
      {/* 用户标记（缩放时显示） */}
      <UserMarkers map={mapRef.current} smells={smells} />
    </div>
  );
}