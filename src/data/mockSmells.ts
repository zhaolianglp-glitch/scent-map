// Mock 气味数据 - 哈尔滨 20 个手工标注点
// 每个气味点有用户信息：头像、用户名、一句描述
import type { OKLCH } from '../utils/oklch';
import { SMELL_PALETTE } from '../utils/colorPalette';

export interface SmellPoint {
  id: string;
  position: [number, number]; // [lng, lat]
  keyword: string;
  oklch: OKLCH;
  intensity: number; // 0-1
  age: number;       // 0-1 (1=新鲜, 0=消散)
  size: number;      // 基础尺寸 px
  phase: number;     // 呼吸相位 0-2π
  // 用户信息
  avatar: string;    // emoji 头像
  username: string;  // 用户名
  message: string;   // 用户说的话
}

interface MockSpec {
  lng: number;
  lat: number;
  keyword: string;
  intensity?: number;
  avatar: string;
  username: string;
  message: string;
}

// 哈尔滨 20 个地标气味点（手工设计，覆盖主要区域）
const SPECS: MockSpec[] = [
  // 中央大街沿线
  { lng: 126.6194, lat: 45.7743, keyword: '老面包房', intensity: 0.85, avatar: '🧑‍🍳', username: '面包爱好者', message: '刚出炉的列巴，麦香飘了半条街' },
  { lng: 126.6201, lat: 45.7751, keyword: '红肠列巴', intensity: 0.8, avatar: '🍖', username: '秋林老顾客', message: '红肠和列巴，哈尔滨人的早餐标配' },
  { lng: 126.6185, lat: 45.7735, keyword: '夜市烧烤', intensity: 0.9, avatar: '🔥', username: '夜宵杀手', message: '炭火味混着孜然，整条街都是香的' },
  { lng: 126.6208, lat: 45.7758, keyword: '老砖墙', intensity: 0.6, avatar: '🧱', username: '老街漫步者', message: '百年砖墙，摸上去有种历史的潮湿感' },

  // 索菲亚教堂周边
  { lng: 126.6230, lat: 45.7770, keyword: '老砖墙', intensity: 0.7, avatar: '🕊️', username: '教堂常客', message: '索菲亚的砖墙，冬天会结一层薄霜' },
  { lng: 126.6225, lat: 45.7765, keyword: '雪', intensity: 0.95, avatar: '❄️', username: '雪夜归人', message: '这是丁香花的味道，混着初雪的气息' },

  // 哈站附近
  { lng: 126.6290, lat: 45.7620, keyword: '煤烟', intensity: 0.7, avatar: '🚂', username: '老哈站人', message: '旧时的煤烟味，现在越来越淡了' },
  { lng: 126.6280, lat: 45.7630, keyword: '豆浆油条', intensity: 0.85, avatar: '🥛', username: '早餐猎手', message: '凌晨四点的豆浆油条，全哈尔滨最香' },
  { lng: 126.6300, lat: 45.7610, keyword: '地铁', intensity: 0.5, avatar: '🚇', username: '通勤路漫漫', message: '地铁里的暖气混着金属味，就是哈尔滨的冬天' },

  // 松花江畔
  { lng: 126.6100, lat: 45.7800, keyword: '松花江', intensity: 0.75, avatar: '🌊', username: '江边散步', message: '松花江的水汽，带着一点鱼腥和芦苇的味道' },
  { lng: 126.6080, lat: 45.7820, keyword: '雨后泥土', intensity: 0.6, avatar: '🌧️', username: '雨中漫步', message: '这是雨后泥土的芬芳，我小时候最熟悉的味道' },
  { lng: 126.6120, lat: 45.7785, keyword: '松花江', intensity: 0.7, avatar: '🎣', username: '钓鱼佬', message: '江边待了一下午，鱼没钓到，但风很舒服' },

  // 哈尔滨工业大学
  { lng: 126.6310, lat: 45.7670, keyword: '落叶', intensity: 0.65, avatar: '🍂', username: '哈工大校友', message: '校园里落叶的味道，混合着食堂的饭香' },
  { lng: 126.6320, lat: 45.7680, keyword: '书店', intensity: 0.55, avatar: '📚', username: '书虫', message: '旧书店的纸墨味，能待一下午' },

  // 哈尔滨工程大学
  { lng: 126.6480, lat: 45.7720, keyword: '落叶', intensity: 0.7, avatar: '🍁', username: '北国过客', message: '操场边的落叶，踩上去咔嚓咔嚓的' },

  // 南岗秋林
  { lng: 126.6400, lat: 45.7600, keyword: '红肠列巴', intensity: 0.8, avatar: '🥖', username: '老秋林', message: '秋林的红肠，每次路过都忍不住买两根' },
  { lng: 126.6410, lat: 45.7610, keyword: '豆浆油条', intensity: 0.75, avatar: '☕', username: '早起的人', message: '热豆浆配油条，零下二十度也不觉得冷' },

  // 道里群力
  { lng: 126.5950, lat: 45.7700, keyword: '雨后泥土', intensity: 0.55, avatar: '🌱', username: '植物爱好者', message: '雨后公园里的泥土味，特别清新' },
  { lng: 126.5960, lat: 45.7685, keyword: '雪', intensity: 0.9, avatar: '⛄', username: '南方来的', message: '第一次见到这么大的雪，空气都是甜的' },

  // 太阳岛
  { lng: 126.5850, lat: 45.7900, keyword: '落叶', intensity: 0.6, avatar: '🚶', username: '岛民', message: '太阳岛的秋天，满地金黄，空气里有木头香' },
  { lng: 126.5870, lat: 45.7920, keyword: '松花江', intensity: 0.7, avatar: '🛶', username: '划船的人', message: '江上吹来的风，带着远方的味道' },
];

export const MOCK_SMELLS: SmellPoint[] = SPECS.map((spec, i) => {
  const palette = SMELL_PALETTE.find(p => p.keyword === spec.keyword)!;
  return {
    id: `smell-${i}`,
    position: [spec.lng, spec.lat],
    keyword: spec.keyword,
    oklch: palette.oklch,
    intensity: spec.intensity ?? 0.7,
    age: 0.6 + Math.random() * 0.4,
    size: 60 + Math.random() * 40,
    phase: Math.random() * Math.PI * 2,
    avatar: spec.avatar,
    username: spec.username,
    message: spec.message,
  };
});

// 哈尔滨中心点（用于地图初始化）
export const HARBIN_CENTER: [number, number] = [126.6200, 45.7750];
export const HARBIN_ZOOM = 12.5;