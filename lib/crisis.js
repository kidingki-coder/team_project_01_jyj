'use strict';

// 위기 표현 단어 목록. 기획서 Ⅳ.1 · 2단계에 따라 AI 판단 없이 이 목록으로만 감지한다.
// 팀이 목록을 검토해 고칠 수 있도록 한 곳에만 둔다. 화면(public/app.js)도 이 목록을 받아 같은 방식으로 검사한다.
// 원칙: 놓치는 것보다 잘못 잡는 것이 덜 위험하다. 일상 표현("짜증나서 못 살겠어")도 잡힐 수 있다.
const WORDS = [
  '죽고 싶',
  '죽을 것 같',
  '죽어버리',
  '죽어 버리',
  '자살',
  '극단적 선택',
  '극단적인 선택',
  '목숨을 끊',
  '목숨 끊',
  '살기 싫',
  '살고 싶지 않',
  '그만 살',
  '사라지고 싶',
  '없어지고 싶',
  '뛰어내리',
  '유서',
  '자해',
  '끝내버리고 싶',
  '끝내고 싶',
  '못 살겠',
  '포기하고 싶',
  '삶을 포기',
];

// 두 말이 한 문장에 함께 나오면 위기로 본다(말 순서가 바뀐 경우: "다 그만두고 싶어요 인생을").
const PAIRS = [
  ['인생', '그만'],
  ['인생', '끝'],
  ['삶', '끝내'],
];

// 띄어쓰기를 모두 지운 뒤 비교한다("죽고싶다"와 "죽고 싶다"를 같게 본다).
function containsCrisis(text) {
  const compact = String(text || '').replace(/\s+/g, '');
  if (WORDS.some((w) => compact.includes(w.replace(/\s+/g, '')))) return true;
  return PAIRS.some(([a, b]) => compact.includes(a) && compact.includes(b));
}

module.exports = { containsCrisis, WORDS, PAIRS };
