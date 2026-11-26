'use strict';

// 이용자가 보낸 말의 종류를 가르는 단어 목록. 위기 단어(lib/crisis.js)와 같이 AI 판단 없이 이 목록으로만 가른다.
// 팀이 목록을 검토해 고칠 수 있도록 한 곳에만 둔다. 화면(public/app.js)도 이 목록을 받아 같은 방식으로 가른다.
//
// 종류(kind): case(사건 설명) · thanks(감사) · feeling(감정) · question(추가 질문)
// 원칙: 사건 설명을 감정·질문으로 잘못 가르면 안내가 막히므로, 애매하면 사건 설명(case)으로 본다.
// 위기 표현은 여기서 다루지 않는다(lib/crisis.js 가 먼저 가져간다).

// 사건이 일어났음을 말하는 표현(사실을 말하는 말투). "송금", "계좌" 같은 주제어만으로는 사건으로 보지 않는다.
const EVENT_WORDS = [
  '했는데', '했어요', '했습니다', '했고', '보냈', '받았', '받지 못', '못 받', '당했', '당해', '당한', '속았', '속아',
  '안 와', '안와', '안 왔', '안 오', '끊겼', '끊어', '차단', '잠적', '사라졌', '없어졌', '연락이 안', '연락이 없',
  '답이 없', '답장이 없', '안 보내', '안 줘', '안 줬', '돌려주지', '환불해 주지', '거절했', '신고했', '입금했', '이체했',
];

const THANKS_WORDS = ['고마워', '고맙', '감사', '덕분', '도움이 됐', '도움이 되었', '도움됐', '도움이 많이', '많은 도움', '큰 도움'];

const FEELING_WORDS = [
  '힘들', '막막', '억울', '무서', '무섭', '불안', '답답', '속상', '화가 나', '화나', '분하', '서럽', '눈물', '지쳐',
  '괴롭', '걱정', '두려', '허탈', '우울', '슬프', '멘붕', '당황', '망했', '어떡해', '어쩌죠',
];

const QUESTION_WORDS = [
  '?', '？', '어떻게', '어디', '언제', '얼마', '뭐', '무엇', '무슨', '왜', '방법', '가능한가', '되나', '인가요', '할까', '있나', '없나', '가요', '나요', '까요',
];

// 이 글자 수 이상이면 사건을 설명한 글로 본다(긴 글에 섞인 감정·물음표 때문에 안내가 막히지 않게).
const LONG_TEXT = 40;

const WORDS = { event: EVENT_WORDS, thanks: THANKS_WORDS, feeling: FEELING_WORDS, question: QUESTION_WORDS, longText: LONG_TEXT };

function squash(s) {
  return String(s || '').replace(/\s+/g, '');
}

function hasAny(compact, list) {
  return list.some((w) => compact.includes(squash(w)));
}

// 반환: { kind, feeling }. feeling 은 사건 설명에 감정 표현이 섞였는지(앞에 공감 한 줄을 붙이는 데 쓴다).
function classify(text) {
  const compact = squash(text);
  const feeling = hasAny(compact, FEELING_WORDS);
  if (compact.length >= LONG_TEXT || hasAny(compact, EVENT_WORDS)) return { kind: 'case', feeling };
  if (hasAny(compact, THANKS_WORDS)) return { kind: 'thanks', feeling: false };
  if (feeling) return { kind: 'feeling', feeling: true };
  if (hasAny(compact, QUESTION_WORDS)) return { kind: 'question', feeling: false };
  return { kind: 'case', feeling: false };
}

module.exports = { WORDS, classify };
