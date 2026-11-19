'use strict';

// 개인정보를 가린다. AI 에 보내기 전에 항상 거친다. 원본은 저장하지 않는다.
// 한계: 이름과 닉네임은 자동으로 가려지지 않는다(판매자 닉네임은 정리표에 필요하기 때문).

// 숫자 경계: 앞뒤에 숫자나 하이픈이 붙어 있으면 더 긴 번호의 일부이므로 여기서 잘라 가리지 않는다.
// (예전에는 우리은행 1002-123-456789 의 가운데만 전화번호로 가려 앞뒤 숫자가 남았다)
const B = '(?<![\\d-])';
const E = '(?![\\d-])';

const RULES = [
  { label: '주민등록번호', re: new RegExp(`${B}\\d{6}\\s?-?\\s?[1-4]\\d{6}${E}`, 'g') },
  { label: '이메일', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { label: '전화번호', re: new RegExp(`${B}(?:01[016789]|0\\d{1,2})[-\\s.]?\\d{3,4}[-\\s.]?\\d{4}${E}`, 'g') },
  // 주소: (시·도) 구·군·시 + 동·읍·면, 또는 도로명 + 건물번호. "서울 강남구 테헤란로 123"처럼 앞의 시가 없어도 잡는다.
  {
    label: '주소',
    re: /(?:[가-힣]+(?:특별시|광역시|특별자치시|도|시)\s)?[가-힣]+(?:시|군|구)\s[가-힣0-9]+(?:(?:로|길)\s?\d+(?:-\d+)?|(?:동|읍|면)(?=[\s,.]|$))/g,
  },
];

// 계좌·카드번호: 숫자 묶음이 하이픈이나 띄어쓰기로 이어진 번호. 숫자가 10자리 이상일 때만 가린다.
// 금액(150,000원)은 쉼표로 끊겨서, 날짜(2026-10-02)는 아래에서 따로 빼서 남는다.
const LONG_NUMBER = /(?<![\d-])\d{2,}(?:[-\s]\d{1,8}){0,4}(?![\d-])/g;
const DATE_START = /^(?:19|20)\d{2}-\d{1,2}-\d{1,2}/;

function redact(input) {
  let text = String(input || '');
  const counts = {};
  const add = (label) => { counts[label] = (counts[label] || 0) + 1; };

  for (const rule of RULES) {
    text = text.replace(rule.re, () => {
      add(rule.label);
      return `[${rule.label}]`;
    });
  }

  text = text.replace(LONG_NUMBER, (m) => {
    if (DATE_START.test(m)) return m;
    const digits = m.replace(/\D/g, '');
    if (digits.length < 10) return m;
    add('계좌·카드번호');
    return '[계좌·카드번호]';
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { text, counts, total };
}

module.exports = { redact };
