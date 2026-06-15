// Zustand store
import { create } from 'zustand';
import { SMELL_PALETTE } from '../utils/colorPalette';
import type { SmellPoint } from '../data/mockSmells';

export interface AppState {
  hoveredSmellId: string | null;
  setHoveredSmell: (id: string | null) => void;

  windSpeed: number;
  windDirAngle: number;
  setWind: (speed: number, angle: number) => void;

  pulse: number;
  setPulse: (p: number) => void;

  // 用户添加的气味
  userSmells: SmellPoint[];
  addUserSmell: (lng: number, lat: number, keyword: string, oklch: { L: number; C: number; H: number }) => void;
  clearUserSmells: () => void;

  // 点击涟漪效果（视觉反馈）
  lastClick: { lng: number; lat: number; t: number } | null;
  triggerClickRipple: (lng: number, lat: number) => void;

  // 模态框状态
  modalOpen: boolean;
  modalPosition: { lng: number; lat: number } | null;
  openModal: (lng: number, lat: number) => void;
  closeModal: () => void;
}

// 9 个用户标注的关键词
const USER_KEYWORDS = [
  '瞬间', '记忆', '陌生人', '老地方', '清晨', '深夜', '雨后', '梦', '未命名',
];

export const useAppStore = create<AppState>((set) => ({
  hoveredSmellId: null,
  setHoveredSmell: (id) => set({ hoveredSmellId: id }),

  windSpeed: 0.45,
  windDirAngle: 290,
  setWind: (speed, angle) => set({ windSpeed: speed, windDirAngle: angle }),

  pulse: 0,
  setPulse: (p) => set({ pulse: p }),

  userSmells: [],
  addUserSmell: (lng, lat, keyword, oklch) => set((state) => {
    const newSmell: SmellPoint = {
      id: `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      position: [lng, lat],
      keyword,
      oklch,
      intensity: 0.85 + Math.random() * 0.15,
      age: 0.95,
      size: 80,
      phase: Math.random() * Math.PI * 2,
      avatar: '👤',
      username: '我',
      message: `我闻到了${keyword}的味道`,
    };
    return { userSmells: [...state.userSmells, newSmell] };
  }),

  clearUserSmells: () => set({ userSmells: [] }),

  lastClick: null,
  triggerClickRipple: (lng, lat) => set({ lastClick: { lng, lat, t: Date.now() } }),

  modalOpen: false,
  modalPosition: null,
  openModal: (lng, lat) => set({ modalOpen: true, modalPosition: { lng, lat } }),
  closeModal: () => set({ modalOpen: false, modalPosition: null }),
}));
