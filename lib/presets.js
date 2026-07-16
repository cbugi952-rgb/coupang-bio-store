// 스타일 프리셋 — AI 자동 생성을 안 쓰는 고정 디자인(안전망, 원가 0).
// 온보딩 "스타일 골라 시작"에서 렌더 → 유저 선택 → applyPreset()로 프로필 스타일 세팅.
// 값은 전부 lib/site.js clean()이 허용하는 enum(theme/font/background/buttonStyle/buttonFill)과 accent hex.
export const PRESETS = [
  { id: "minimal", label: "미니멀 · 시크", desc: "패션 · 포트폴리오",
    style: { accent: "#222222", theme: "mono", background: "solid", font: "myeongjo", buttonStyle: "square", buttonFill: "outline", stickers: [] } },
  { id: "warm", label: "따뜻 · 친근", desc: "일상 · 쇼핑",
    style: { accent: "#FF9E45", theme: "cream", background: "dots", font: "jua", buttonStyle: "round", buttonFill: "solid", stickers: ["☕", "🧡"] } },
  { id: "bold", label: "강렬 · 다크", desc: "게임 · 테크",
    style: { accent: "#8B5CF6", theme: "dark", background: "grid", font: "gothic", buttonStyle: "pill", buttonFill: "solid", stickers: ["🔥", "🎮"] } },
  { id: "cute", label: "귀여움 · 발랄", desc: "뷰티 · 라이프",
    style: { accent: "#FF6B9D", theme: "pink", background: "dots", font: "gaegu", buttonStyle: "pill", buttonFill: "soft", stickers: ["🎀", "✨"] } },
  { id: "pro", label: "클린 · 전문", desc: "비즈니스 · 교육",
    style: { accent: "#2563EB", theme: "mono", background: "solid", font: "gothic", buttonStyle: "round", buttonFill: "solid", stickers: [] } },
];

// 선택한 프리셋의 스타일을 프로필에 얹는다(콘텐츠 필드는 건드리지 않음).
export function applyPreset(profile, presetId) {
  const p = PRESETS.find((x) => x.id === presetId);
  return p ? { ...profile, ...p.style } : profile;
}
