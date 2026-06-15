// AI 文字→颜色映射服务
// 使用 OpenAI GPT-4o-mini 实现语义到颜色的转换
import type { OKLCH } from '../utils/oklch';

const CACHE_KEY = 'scent-color-cache';
const CACHE_EXPIRY_KEY = 'scent-color-cache-expiry';
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 天缓存过期

// 缓存结构
interface ColorCache {
  [text: string]: { oklch: OKLCH; timestamp: number };
}

// 加载缓存
function loadCache(): ColorCache {
  try {
    const expiry = localStorage.getItem(CACHE_EXPIRY_KEY);
    if (expiry && Date.now() - parseInt(expiry) > CACHE_MAX_AGE) {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_EXPIRY_KEY);
      return {};
    }
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

// 保存缓存
function saveCache(cache: ColorCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    localStorage.setItem(CACHE_EXPIRY_KEY, Date.now().toString());
  } catch {
    // 忽略存储错误
  }
}

// HEX → OKLCH 转换
function hexToOklch(hex: string): OKLCH {
  // 解析 HEX
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // sRGB → Linear RGB
  const toLinear = (c: number) => c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);

  // Linear RGB → OKLab
  const l_ = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m_ = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s_ = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

  const l = Math.cbrt(l_);
  const m = Math.cbrt(m_);
  const s = Math.cbrt(s_);

  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bLab = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

  // OKLab → OKLCH
  const C = Math.sqrt(a * a + bLab * bLab);
  let H = Math.atan2(bLab, a) * 180 / Math.PI;
  if (H < 0) H += 360;

  return { L, C, H };
}

// 调用 OpenAI API 获取颜色
async function fetchColorFromAI(text: string): Promise<OKLCH | null> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    console.warn('[ColorAI] No API key configured, using fallback');
    return null;
  }

  const prompt = `你是一个"文字到颜色"的转换器。
用户会输入一段简短的文字（最多20字），描述一种气味、心情或感受。
请根据这段文字的语义和情感，返回一个最能代表它的颜色。

规则：
1. 只返回一个 HEX 颜色值，格式如 #FF6B6B
2. 不要返回任何解释
3. 颜色要有美感，避免过于鲜艳或暗淡
4. 考虑中文语境和文化联想

用户输入：${text}
颜色：`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '你是一个颜色转换器，只返回 HEX 颜色值。' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 20,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error('[ColorAI] API error:', response.status);
      return null;
    }

    const data = await response.json();
    const hex = data.choices?.[0]?.message?.content?.trim();

    if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      console.error('[ColorAI] Invalid HEX response:', hex);
      return null;
    }

    return hexToOklch(hex);
  } catch (error) {
    console.error('[ColorAI] Fetch error:', error);
    return null;
  }
}

// 主函数：获取颜色（带缓存）
export async function getColorForText(text: string): Promise<OKLCH> {
  const normalizedText = text.trim().toLowerCase();

  // 检查缓存
  const cache = loadCache();
  if (cache[normalizedText]) {
    return cache[normalizedText].oklch;
  }

  // 调用 AI
  const aiColor = await fetchColorFromAI(normalizedText);

  if (aiColor) {
    // 保存缓存
    cache[normalizedText] = { oklch: aiColor, timestamp: Date.now() };
    saveCache(cache);
    return aiColor;
  }

  // Fallback：返回默认颜色（由调用方处理）
  return { L: 0.6, C: 0.1, H: 30 };
}

// 同步版本：仅用于实时预览（使用缓存或默认值）
export function getColorForTextSync(text: string): OKLCH {
  const normalizedText = text.trim().toLowerCase();
  const cache = loadCache();
  if (cache[normalizedText]) {
    return cache[normalizedText].oklch;
  }
  // 无缓存时返回默认值，等待异步调用
  return { L: 0.6, C: 0.1, H: 30 };
}
