// 气味输入弹窗 — 浮动气泡，灵动有趣
// 支持自由输入 + 预定义词库建议 + 智能颜色匹配
import { useState, useEffect, useRef } from 'react';
import { SMELL_PALETTE } from '../utils/colorPalette';
import type { OKLCH } from '../utils/oklch';

interface Props {
  center: { x: number; y: number } | null;
  onClose: () => void;
  onConfirm: (keyword: string, oklch: OKLCH) => void;
}

// 所有已知词汇（用于输入过滤）
const ALL_KEYWORDS = SMELL_PALETTE.map(p => p.keyword);

/**
 * 为新词汇生成稳定的 OKLCH 颜色（确定性哈希）
 * L: 0.58-0.72（适中亮度）、C: 0.10-0.24（柔和饱和度）、H: 0-360（全色相）
 */
function hashColor(text: string): OKLCH {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h) + text.charCodeAt(i);
    h |= 0;
  }
  const absH = Math.abs(h);
  return {
    L: 0.58 + (absH % 1400) / 10000,         // 0.58 ~ 0.72
    C: 0.10 + (absH % 1400) / 10000,          // 0.10 ~ 0.24
    H: ((absH * 31 + 7) % 3600) / 10,        // 0 ~ 360
  };
}

export function ScentInputModal({ center, onClose, onConfirm }: Props) {
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [animState, setAnimState] = useState<'enter' | 'idle' | 'exit'>('enter');
  const inputRef = useRef<HTMLInputElement>(null);

  // 当前匹配的颜色
  const matchedPalette = SMELL_PALETTE.find(p => p.keyword === text.trim());
  const previewColor = matchedPalette
    ? matchedPalette.oklch
    : text.trim() ? hashColor(text.trim()) : null;

  useEffect(() => {
    if (center) {
      setAnimState('enter');
      setTimeout(() => setAnimState('idle'), 50);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [center]);

  // 过滤建议
  useEffect(() => {
    const q = text.trim();
    if (q) {
      setSuggestions(
        ALL_KEYWORDS.filter(k => k.includes(q)).slice(0, 6)
      );
    } else {
      setSuggestions(ALL_KEYWORDS.slice(0, 6));
    }
    setSelectedIndex(-1);
  }, [text]);

  const handleConfirm = (keyword: string) => {
    const palette = SMELL_PALETTE.find(p => p.keyword === keyword);
    const oklch = palette ? palette.oklch : hashColor(keyword);
    setAnimState('exit');
    setTimeout(() => {
      onConfirm(keyword, oklch);
    }, 150);
  };

  const handleClose = () => {
    setAnimState('exit');
    setTimeout(() => {
      onClose();
    }, 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const keyword = selectedIndex >= 0 && suggestions[selectedIndex]
        ? suggestions[selectedIndex]
        : text.trim();
      if (keyword) handleConfirm(keyword);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, -1));
    }
  };

  if (!center) return null;

  const x = Math.min(Math.max(center.x - 140, 10), window.innerWidth - 300);
  const y = Math.min(Math.max(center.y - 160, 10), window.innerHeight - 300);

  return (
    <>
      {/* 遮罩（点击关闭） */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'transparent',
        }}
      />

      {/* 浮动气泡 */}
      <div
        style={{
          position: 'fixed',
          left: x,
          top: y,
          zIndex: 1001,
          width: 280,
          transform: animState === 'exit'
            ? 'scale(0.8) translateY(10px)'
            : animState === 'enter'
            ? 'scale(0.8) translateY(10px)'
            : 'scale(1) translateY(0)',
          opacity: animState === 'exit' ? 0 : 1,
          transition: 'all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <div style={{
          background: 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(16px)',
          borderRadius: 16,
          padding: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid rgba(0,0,0,0.06)',
        }}>
          {/* 输入行 + 颜色预览 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {previewColor && (
              <span style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                flexShrink: 0,
                background: `oklch(${previewColor.L} ${previewColor.C} ${previewColor.H})`,
                border: '1px solid rgba(0,0,0,0.1)',
              }} />
            )}
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="你闻到了什么？自由输入..."
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: 15,
                background: 'transparent',
                color: '#333',
                fontFamily: 'inherit',
              }}
            />
            {text.trim() && (
              <button
                onMouseDown={e => { e.preventDefault(); handleConfirm(text.trim()); }}
                style={{
                  background: '#333',
                  border: 'none',
                  color: '#fff',
                  fontSize: 12,
                  padding: '4px 10px',
                  borderRadius: 14,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                确认
              </button>
            )}
            <button
              onClick={handleClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 16,
                cursor: 'pointer',
                color: '#999',
                padding: '2px 6px',
                borderRadius: 4,
              }}
            >
              ✕
            </button>
          </div>

          {/* 建议词列表 */}
          {suggestions.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {suggestions.map((kw, i) => {
                const palette = SMELL_PALETTE.find(p => p.keyword === kw);
                return (
                  <button
                    key={kw}
                    onMouseDown={e => { e.preventDefault(); handleConfirm(kw); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 10px',
                      borderRadius: 20,
                      border: 'none',
                      fontSize: 12,
                      cursor: 'pointer',
                      background: i === selectedIndex ? '#f0f0f0' : 'transparent',
                      color: '#555',
                      transition: 'all 0.1s',
                    }}
                  >
                    {palette && (
                      <span style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: `oklch(${palette.oklch.L} ${palette.oklch.C} ${palette.oklch.H})`,
                      }} />
                    )}
                    {kw}
                  </button>
                );
              })}
            </div>
          )}

          {/* 提示：自由输入也支持 */}
          {text.trim() && !matchedPalette && (
            <div style={{
              marginTop: 6,
              fontSize: 10,
              color: '#aaa',
              textAlign: 'center',
            }}>
              新词"{text.trim()}"将自动生成专属颜色
            </div>
          )}
        </div>

        {/* 气泡尾巴 */}
        <div style={{
          width: 0, height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '8px solid rgba(255,255,255,0.97)',
          margin: '0 auto',
          position: 'relative',
          top: -1,
        }} />
      </div>
    </>
  );
}