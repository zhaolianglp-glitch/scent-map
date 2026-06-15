// 极简 Header — 只用一个小 logo 占据左上角
// 当用户放大到 zoom ≥ 14 时自然看到用户头像和话语，不需要标题说明
export function Header() {
  return (
    <div style={{
      position: 'absolute',
      top: 12,
      left: 12,
      zIndex: 20,
      pointerEvents: 'none',
    }}>
      <span style={{
        fontSize: 13,
        fontWeight: 500,
        color: 'rgba(0,0,0,0.35)',
        letterSpacing: '0.5px',
      }}>
        气味地图
      </span>
    </div>
  );
}