'use strict';

// 규칙표 분류 · 안내 문구 · 증거 정리표. AI 없이 코드로 처리한다.
// 값 목록은 기획서 〈표 5〉, 분류 규칙은 〈표 7〉을 그대로 옮긴 것이다.

const QUESTIONS = [
  { key: 'situation', label: '어떤 일인가요?', values: ['중고거래 피해', '착오송금', '보이스피싱 등 다른 피해', '모름'] },
  { key: 'payment', label: '돈은 어떻게 보내셨나요?', values: ['계좌이체', '플랫폼 안전결제', '직거래 현장 결제', '모름'] },
  { key: 'receipt', label: '물건은 받으셨나요?', values: ['못 받음', '배송 중이라고 함', '설명과 상태가 다름', '전혀 다른 물건이 옴', '배송 중 파손', '쿠폰·번호가 이미 사용됨·없음', '모름'] },
  { key: 'contact', label: '지금 판매자와 연락이 되나요?', values: ['연락됨', '답 없음·차단', '판매 글·계정 사라짐', '모름'] },
  { key: 'fakePost', label: '판매 글에 이상한 점이 있었나요?', values: ['남의 사진이었음', '다른 피해 글을 봄', '없음', '모름'] },
  { key: 'itemKind', label: '무엇을 사셨나요?', values: ['실물', '비실물(쿠폰·상품권·티켓)', '모름'] },
];

const FACT_KEYS = QUESTIONS.map((q) => q.key);
const VALUES = Object.fromEntries(QUESTIONS.map((q) => [q.key, q.values]));

// 이 도구의 범위 밖인 상황(착오송금·보이스피싱). 규칙표보다 먼저 가린다.
const OUT_OF_SCOPE = {
  '착오송금': '착오송금',
  '보이스피싱 등 다른 피해': '보이스피싱',
};

const DRAFT_MESSAGE =
  '안녕하세요. 거래한 물건을 받았는데 판매 글 설명과 상태가 다릅니다. ' +
  '확인해 보시고 환불 또는 교환 방법을 알려 주세요. 답변은 ○월 ○일까지 부탁드립니다.';

// 기획서 〈표 8〉·Ⅳ장의 안내 내용. 결과 이름을 키로 쓴다.
const RESULT_INFO = {
  '사기 의심': {
    color: 'red',
    title: '사기가 의심되는 상황이에요',
    note: '사기 여부를 판정하는 것이 아니라, 지금 해야 할 일을 안내하는 참고 정보예요.',
    steps: [
      '더 보내지 마시고, 대화 내역과 판매 글을 지금 바로 캡처해 두세요.',
      '이체한 은행에 연락해 지급정지가 되는지 물어보세요. 은행마다 판단이 달라요.',
      '경찰청 사이버범죄 신고시스템(ecrm.police.go.kr) 또는 가까운 경찰서에 신고하세요. 아래 증거 정리표를 함께 가져가세요.',
    ],
    institutions: [
      '경찰청 사이버범죄 신고시스템(ecrm.police.go.kr) 또는 경찰서',
      '온라인피해 365센터 ☎142-235 (도움이 더 필요할 때)',
    ],
  },
  '거래 분쟁': {
    color: 'blue',
    title: '거래 분쟁으로 보이는 상황이에요',
    note: '물건이 설명과 다른 경우는 사기보다 분쟁 절차로 풀리는 경우가 많아요.',
    steps: [
      '판매자에게 아래 요청 메시지를 보내고, 답장을 캡처해 두세요.',
      '거래 플랫폼의 1차 조정 절차를 이용하세요.',
      '1차 조정이 안 되면 전자문서·전자거래분쟁조정위원회에 2차 조정을 신청하세요. 증거 정리표를 함께 준비하세요.',
    ],
    institutions: [
      '거래 플랫폼 (1차 조정)',
      '전자문서·전자거래분쟁조정위원회 (2차 조정)',
      '온라인피해 365센터 ☎142-235',
    ],
  },
  '범위 밖 · 착오송금': {
    color: 'green',
    title: '착오송금으로 보이는 상황이에요',
    note: '이 도구가 다루는 중고거래 피해가 아니어서, 맞는 기관을 바로 안내해요.',
    steps: [
      '송금한 은행 고객센터에 착오송금 반환을 요청하세요.',
      '은행을 통한 반환이 어려우면 예금보험공사 착오송금 반환지원을 확인하세요(☎1588-0037).',
      '반환 지원 금액의 상한은 예금보험공사에 확인하세요. 건당 5만 원 이상이라는 안내만 드릴 수 있어요.',
    ],
    institutions: ['송금 은행 고객센터', '예금보험공사 착오송금 반환지원 ☎1588-0037'],
  },
  '범위 밖 · 보이스피싱': {
    color: 'green',
    title: '보이스피싱이 의심되는 상황이에요',
    note: '보이스피싱은 이 도구의 범위 밖이므로 바로 신고 경로를 안내해요.',
    steps: [
      '즉시 112에 신고하세요.',
      '송금한 은행에 지급정지를 요청하세요.',
      '인증번호나 비밀번호를 알려 줬다면 그 사실도 신고할 때 함께 알리세요.',
    ],
    institutions: ['112 (즉시 신고)', '송금 은행 (지급정지 요청)'],
  },
  '판단 어려움': {
    color: 'gray',
    title: '지금 정보로는 판단이 어려워요',
    note: '정해진 기준에 맞지 않아 분류하지 않았어요. 상담원이 함께 보는 것이 좋아요.',
    steps: [
      '온라인피해 365센터 상담원에게 연결하세요. 평일 09:00~18:00, ☎142-235 입니다.',
      '아래 증거 정리표를 상담원에게 보여 주면 같은 질문을 다시 받지 않아요.',
    ],
    institutions: ['온라인피해 365센터 ☎142-235'],
  },
};

const CRISIS_INFO = {
  title: '지금 많이 힘드시다면 도움을 받으세요',
  text: '자살예방 상담전화 109 로 바로 연결할 수 있어요.',
};

const DISCLAIMER = '※ 이 안내는 법적 판단이 아닙니다. 사기 여부나 자격을 판정하지 않습니다.';

// 피해자가 직접 적는 추가 정보. 모두 선택 항목이다. 계좌번호는 받지 않는다(신고할 때 직접 적는다).
const EXTRA_LIMITS = {
  amount: 60, date: 60, bank: 60, nick: 60, app: 60,
  item: 100, price: 60, postDate: 60, talk: 400,
};

// 값이 목록에 없으면 '모름'으로 바꾼다. AI 가 엉뚱한 값을 내도 여기서 걸러진다.
function normalizeFacts(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const k of FACT_KEYS) out[k] = VALUES[k].includes(src[k]) ? src[k] : '모름';
  return out;
}

// 분류에 꼭 필요한데 '모름'인 항목. 비어 있으면 버튼으로 되묻는다.
function requiredMissing(f) {
  if (f.situation === '모름') return ['situation'];
  if (OUT_OF_SCOPE[f.situation]) return [];
  return ['receipt', 'contact'].filter((k) => f[k] === '모름');
}

// 〈표 7〉 규칙표. 위에서부터 보고 처음 맞는 줄의 결과를 낸다.
function classify(f) {
  if (OUT_OF_SCOPE[f.situation]) {
    return { result: `범위 밖 · ${OUT_OF_SCOPE[f.situation]}`, rule: null };
  }
  const r = f.receipt;
  const c = f.contact;
  const p = f.fakePost;
  const rules = [
    [1, r === '전혀 다른 물건이 옴', '사기 의심'],
    [2, p === '남의 사진이었음', '사기 의심'],
    [3, p === '다른 피해 글을 봄', '사기 의심'],
    [4, r === '못 받음' && c === '답 없음·차단', '사기 의심'],
    [5, r === '못 받음' && c === '판매 글·계정 사라짐', '사기 의심'],
    [6, r === '쿠폰·번호가 이미 사용됨·없음', '사기 의심'],
    [7, r === '설명과 상태가 다름' && c === '연락됨', '거래 분쟁'],
    [8, r === '배송 중 파손' && c === '연락됨', '거래 분쟁'],
  ];
  for (const [no, hit, result] of rules) {
    if (hit) return { result, rule: no };
  }
  return { result: '판단 어려움', rule: null };
}

function sanitizeExtra(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const [k, max] of Object.entries(EXTRA_LIMITS)) {
    out[k] = typeof s[k] === 'string' ? s[k].trim().slice(0, max) : '';
  }
  return out;
}

// 입력값이 있으면 그 값을, 없으면 [확인 필요: …] 표시를 남긴다.
function valOr(v, need) {
  return v ? v : `[확인 필요: ${need}]`;
}

const RECEIPT_SENTENCE = {
  '못 받음': '약속한 물건을 받지 못하였습니다.',
  '배송 중이라고 함': '판매자는 배송 중이라고 하였으나 아직 물건을 받지 못하였습니다.',
  '설명과 상태가 다름': '물건을 받았으나 판매 글의 설명과 상태가 달랐습니다.',
  '전혀 다른 물건이 옴': '물건을 받았으나 판매 글과 전혀 다른 물건이었습니다.',
  '배송 중 파손': '물건을 받았으나 배송 중 파손되어 있었습니다.',
  '쿠폰·번호가 이미 사용됨·없음': '받은 쿠폰이나 번호가 이미 사용되었거나 존재하지 않았습니다.',
};

const CONTACT_SENTENCE = {
  '연락됨': '현재 판매자와 연락이 되고 있습니다.',
  '답 없음·차단': '송금 후 판매자가 답하지 않았고, 연락이 차단된 상태입니다.',
  '판매 글·계정 사라짐': '송금 후 판매 글과 판매자 계정이 사라졌습니다.',
};

// 진술서 형식의 사건 경위 문단. 피해자가 말한 사실만 날짜순으로 옮긴다. 판단 문장은 넣지 않는다.
function buildNarrative(f, x) {
  const parts = [];
  // 첫 문장에는 날짜를 넣지 않는다. 피해자가 적은 날짜는 "송금한 날짜"이지 판매 글을 본 날이 아니기 때문이다.
  const where = x.app ? `${x.app}에서 ` : '';
  const what = x.item ? `"${x.item}" 판매 글을 보고` : '상품 판매 글을 보고';
  const posted = x.postDate ? `(판매 글 게시일: ${x.postDate}) ` : '';
  parts.push(`${where}${what} ${posted}판매자와 거래하기로 하였습니다.`);

  if (x.nick) parts.push(`판매자 닉네임은 ${x.nick}입니다.`);
  if (x.price) parts.push(`상품 가격은 ${x.price}입니다.`);

  // 돈을 보낸 방법에 따라 문장을 바꾼다(안전결제·현장 결제는 계좌로 보낸 것이 아니다).
  const when = x.date ? `${x.date}에 ` : '[확인 필요: 송금 날짜·시간] ';
  if (f.payment === '플랫폼 안전결제') {
    parts.push(`${when}플랫폼 안전결제로 대금을 결제하였습니다.`);
  } else if (f.payment === '직거래 현장 결제') {
    parts.push(`${when}직거래 현장에서 대금을 지급하였습니다.`);
  } else {
    const bank = x.bank ? `${x.bank} 계좌로` : '[확인 필요: 입금 은행] 계좌로';
    const how = f.payment === '계좌이체' ? '돈을 이체하였습니다.' : '돈을 보냈습니다. [확인 필요: 송금 방법]';
    parts.push(`${when}${bank} ${how}`);
  }
  parts.push(x.amount ? `보낸 금액은 ${x.amount}입니다.` : '[확인 필요: 보낸 금액]');

  parts.push(RECEIPT_SENTENCE[f.receipt] || '[확인 필요: 물건 수령 여부]');
  parts.push(CONTACT_SENTENCE[f.contact] || '[확인 필요: 판매자 연락 상태]');

  if (f.fakePost === '남의 사진이었음') parts.push('판매 글의 사진이 다른 사람의 사진으로 확인되었습니다.');
  if (f.fakePost === '다른 피해 글을 봄') parts.push('같은 판매자와 관련된 다른 피해 글을 본 적이 있습니다.');

  if (x.talk) parts.push(`대화 내용의 요점은 다음과 같습니다. ${x.talk}`);
  return parts.join(' ');
}

function buildSheet(f, cls, x, institutions) {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const check = (ok) => (ok ? '[v]' : '[ ]');
  const lines = [
    '==================================================',
    '[온라인피해 365센터] 중고거래 피해 제출용 증거 정리표',
    '==================================================',
    `작성일시: ${now}`,
    '※ 아래 내용은 피해자가 기억하는 사실을 정리한 것입니다. 사실과 다른 부분은 고친 뒤 제출하세요.',
    '',
    `[1] 진단 결과: ${cls.result}${cls.rule ? ` (규칙 ${cls.rule})` : ''}`,
    `   - 상황 구분: ${f.situation}`,
    `   - 송금 방법: ${f.payment}`,
    `   - 수령 상태: ${f.receipt}`,
    `   - 연락 상태: ${f.contact}`,
    `   - 판매 글 정황: ${f.fakePost}`,
    `   - 상품 종류: ${f.itemKind}`,
    '',
    '[2] 사건 경위 (진술서 초안)',
    `   ${buildNarrative(f, x)}`,
    '',
    '[3] 피해 금액 및 송금 내역',
    `   - 피해 금액: ${valOr(x.amount, '피해 금액')}`,
    `   - 송금 날짜·시간: ${valOr(x.date, '송금 날짜·시간')}`,
    `   - 송금 방법: ${f.payment}`,
    `   - 입금 은행: ${valOr(x.bank, '입금 은행')}`,
    '   - 계좌번호·계좌주: 이 화면에는 받지 않았어요. 신고할 때 은행 정보를 직접 적으세요.',
    '',
    '[4] 거래 내용',
    `   - 상품명: ${valOr(x.item, '상품명')}`,
    `   - 상품 가격: ${valOr(x.price, '상품 가격')}`,
    `   - 판매 글 게시일: ${valOr(x.postDate, '판매 글 게시일')}`,
    `   - 거래 앱: ${valOr(x.app, '거래 앱')}`,
    '',
    '[5] 상대방 정보',
    `   - 판매자 닉네임·ID: ${valOr(x.nick, '판매자 닉네임')}`,
    `   - 연락 상태: ${f.contact}`,
    '',
    '[6] 필수 첨부 증거 체크리스트 (준비되면 [v] 표시)',
    '   [ ] 대화 내역 전체 캡처 (날짜·시간이 보이게)',
    '   [ ] 판매 글 캡처와 글 주소 (지워지기 전)',
    '   [ ] 상대방 프로필 화면 (닉네임·ID)',
    '   [ ] 이체 확인증 (은행 앱이나 창구에서 발급)',
    '   [ ] 받은 물건 사진 또는 배송 상태 캡처 (해당하는 경우)',
    '',
    '[7] 신고 필수 항목 점검',
    `   ${check(!!x.date)} 범행 일시: ${x.date || '[확인 필요]'}`,
    `   ${check(!!x.amount)} 피해 금액: ${x.amount || '[확인 필요]'}`,
    '   [ ] 범행에 이용된 계좌번호: 신고할 때 직접 적으세요',
    `   ${check(!!x.bank)} 은행명: ${x.bank || '[확인 필요]'}`,
    '   [ ] 계좌주: 신고할 때 직접 적으세요',
    '',
    '[8] 우선 제출 기관 (순서)',
    ...institutions.map((s, i) => `   ${i + 1}) ${s}`),
    '',
    '--------------------------------------------------',
    '※ 이 정리표는 안내용이며 법적 효력을 갖지 않습니다.',
    '※ 원본 캡처 파일을 함께 가져가세요.',
    '==================================================',
  ];
  return lines.join('\n');
}

// 진단 한 번에 필요한 것을 모두 처리한다.
function diagnose(rawFacts, rawExtra, crisis) {
  const facts = normalizeFacts(rawFacts);
  // 상황 구분은 항상 먼저 묻는다(착오송금·보이스피싱이면 다른 질문이 필요 없다).
  if (facts.situation === '모름') return { status: 'need', missing: ['situation'], crisis };

  // 규칙표로 먼저 분류해 보고, 이미 결론이 났으면 더 묻지 않는다.
  // 규칙표는 위에서부터 처음 맞는 줄을 쓰므로, 결론이 난 뒤에는 남은 답이 결과를 바꾸지 못한다.
  const cls = classify(facts);
  if (cls.result === '판단 어려움') {
    const missing = requiredMissing(facts);
    if (missing.length) return { status: 'need', missing, crisis };
  }
  const info = RESULT_INFO[cls.result];
  const extra = sanitizeExtra(rawExtra);
  const notes = [];
  if (facts.receipt === '배송 중이라고 함') {
    notes.push('배송 중인 경우는 규칙표에 없어 분류하지 않았어요. 배송이 끝난 뒤 다시 진단하거나 상담원에게 문의하세요.');
  }
  return {
    status: 'done',
    crisis,
    facts,
    result: cls.result,
    rule: cls.rule,
    color: info.color,
    title: info.title,
    note: info.note,
    steps: info.steps,
    institutions: info.institutions,
    notes,
    draft: cls.result === '거래 분쟁' ? DRAFT_MESSAGE : null,
    sheet: buildSheet(facts, cls, extra, info.institutions),
    disclaimer: DISCLAIMER,
  };
}

module.exports = {
  QUESTIONS,
  FACT_KEYS,
  VALUES,
  CRISIS_INFO,
  EXTRA_LIMITS,
  normalizeFacts,
  requiredMissing,
  classify,
  buildNarrative,
  diagnose,
};
