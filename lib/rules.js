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

// 거래한 곳(플랫폼)과 지금까지 한 일. 안내를 피해자 상황에 맞게 고르는 데 쓴다.
const PLATFORMS = ['당근', '번개장터', '중고나라', '기타·모름'];
const DONE_KEYS = ['bank', 'police', 'platform'];

// 이미 한 일이면 같은 일을 다시 시키지 않고, 그 결과를 기록해 두게 한다.
const DONE_STEP = {
  bank: '은행에 이미 연락하셨어요. 답변(지급정지 여부)과 연락한 시각을 적어 두세요.',
  police: '경찰에 이미 신고하셨어요. 접수번호와 담당 경찰서를 적어 두세요.',
  platform: '플랫폼에 이미 신고하셨어요. 접수 화면과 받은 답변을 캡처해 두세요.',
};

// 바로 연결할 수 있는 곳. 전화번호·주소는 답변참고문서(법제처 생활법령정보, 경찰청 등)에 나온 것만 쓴다.
const ACTIONS = {
  ecrm: { label: '경찰청 사이버범죄 신고시스템', url: 'https://ecrm.police.go.kr', note: '먼저 접수한 뒤 경찰서를 방문하면 빠르게 처리돼요' },
  c365: { label: '온라인피해 365센터', tel: '142-235', url: 'https://www.helpos.kr', note: '월~금 09:00~12:00, 13:00~18:00 (수신자 부담)' },
  klac: { label: '대한법률구조공단 법률상담', tel: '132', url: 'https://www.klac.or.kr', note: '무료 법률상담' },
  consumer24: { label: '소비자24 피해구제 신청', url: 'https://www.consumer.go.kr', note: '한국소비자원 분쟁조정으로 이어져요' },
  c1372: { label: '1372 소비자상담센터', tel: '1372', url: 'https://www.ccn.go.kr', note: '환불·하자 분쟁 상담' },
  thecheat: { label: '더치트 피해사례 등록', url: 'https://thecheat.co.kr', note: '같은 판매자의 다른 피해를 막는 데 도움이 돼요' },
  deposit: { label: '예금보험공사 착오송금 반환지원', tel: '1588-0037' },
  police112: { label: '112 신고', tel: '112', note: '즉시 신고' },
};

const SRC = {
  easy1: { name: '법제처 생활법령정보 「중고거래 피해 신고와 대응방법」', url: 'https://www.easylaw.go.kr/CSP/CnpClsMainBtr.laf?popMenu=ov&csmSeq=2850&ccfNo=3&cciNo=1&cnpClsNo=1' },
  easy2: { name: '법제처 생활법령정보 「중고거래 피해 해결」', url: 'https://www.easylaw.go.kr/CSP/CnpClsMainBtr.laf?popMenu=ov&csmSeq=2850&ccfNo=3&cciNo=1&cnpClsNo=2' },
  easy3: { name: '법제처 생활법령정보 「중고거래 피해자 지원」', url: 'https://www.easylaw.go.kr/CSP/CnpClsMainBtr.laf?popMenu=ov&csmSeq=2850&ccfNo=3&cciNo=1&cnpClsNo=3' },
  ecrmQna: { name: '경찰청 사이버범죄 신고시스템 Q&A 「사기당한 돈 돌려받는 방법」', url: 'https://ecrm.police.go.kr/minwon/crs/quick/qna' },
  segye: { name: '세계일보 (2023. 10. 17.) 중고거래 사기 계좌 지급정지 보도', url: 'https://www.segye.com/newsView/20231017520204' },
};

// 플랫폼별 신고 방법. 법제처 생활법령정보 「중고거래 피해 신고와 대응방법」을 옮겼다.
const PLATFORM_GUIDE = {
  '당근': [
    '경찰서에 신고하면 수사기관이 당근에 상대방 정보를 요청해요. 상대를 찾을 수 있게 프로필 옆 #알파벳+숫자 ID와 닉네임을 지금 캡처해 두세요.',
    '채팅방이 만들어진 시각과 내 계정의 닉네임·고유아이디(또는 전화번호)도 적어 두세요. 상대가 탈퇴하거나 채팅방을 나가면 ID 확인이 어려워질 수 있어요.',
    '당근페이로 송금했다면 신고할 때 꼭 알려 주세요. 수사기관이 당근과 당근페이 두 곳에 자료를 요청해야 해요.',
  ],
  '번개장터': [
    '문제가 생긴 거래 내역이나 채팅방에서 판매자 프로필 또는 채팅방 메뉴의 \'신고하기\'를 누르세요.',
    '신고 사유(사기 의심, 물품 미배송, 허위·과장 정보 등)를 고르고, 증거를 첨부해 상세 내용을 적으세요.',
  ],
  '중고나라': [
    '중고나라에 분쟁/불만 처리를 요청하세요. 상대방 닉네임, 상대방 상품 사진, 외부거래 링크, 연락두절 정황, 앱 내 채팅과 입금 내역을 함께 적어야 해요.',
    '담당자가 사실을 확인하고 최대 7영업일 안에 처리 결과를 알려 줘요.',
    '그와 별개로 사이버수사국에 직접 신고하세요. 범행일시, 피해금액, 범행에 이용한 계좌번호, 은행명, 계좌주와 진술서가 필요해요.',
  ],
  '기타·모름': [
    '플랫폼마다 절차가 달라요. 거래한 앱의 신고하기나 고객센터 메뉴에서 신고를 접수하고, 접수 화면을 캡처해 두세요.',
  ],
};

// 기획서 〈표 8〉·Ⅳ장의 안내 내용. 결과 이름을 키로 쓴다.
// steps 의 tag 는 이미 한 일(bank·police·platform)과 겹치는 단계를 가리는 데 쓴다.
const RESULT_INFO = {
  '사기 의심': {
    color: 'red',
    title: '사기가 의심되는 상황이에요',
    note: '사기 여부를 판정하는 것이 아니라, 지금 해야 할 일을 안내하는 참고 정보예요.',
    steps: [
      '더 보내지 마시고, 대화 내역과 판매 글, 상대 프로필(닉네임·ID), 이체 확인증을 지금 바로 캡처해 두세요.',
      { tag: 'bank', t: '이체한 은행에 연락해 지급정지가 되는지 물어보세요. 은행마다 판단이 달라요.' },
      { tag: 'police', t: '경찰청 사이버범죄 신고시스템(ecrm.police.go.kr)에 먼저 접수한 뒤 경찰서를 방문하면 빠르게 처리돼요. 온라인 신고는 피해자 본인만 할 수 있고, 가족 등 대리인은 경찰서를 직접 방문하거나 국민신문고로 신고해요. 아래 증거 정리표를 함께 가져가세요.' },
      { tag: 'platform', t: '거래한 플랫폼에도 신고하세요. 방법은 아래에 정리했어요.' },
    ],
    actions: ['ecrm', 'c365', 'klac', 'thecheat'],
    sources: ['easy1', 'ecrmQna', 'easy3', 'segye'],
    refund: {
      title: '돈을 돌려받으려면',
      items: [
        '경찰청 안내에 따르면 배상명령(형사)과 지급명령·소액심판(민사)은 모두 범인이 검거된 뒤에 신청할 수 있어요.',
        '소액사건심판은 3,000만 원 이하의 금전 청구가 대상이에요.',
        '대한법률구조공단(☎132)에서 무료로 법률상담을 받을 수 있고, 요건이 맞으면 민사소송 지원도 받을 수 있어요.',
      ],
    },
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
      { tag: 'platform', t: '거래 플랫폼의 1차 조정 절차를 이용하세요. 방법은 아래에 정리했어요.' },
      '1차 조정이 안 되면 전자문서·전자거래분쟁조정위원회에 2차 조정을 신청하세요. 증거 정리표를 함께 준비하세요.',
    ],
    institutions: [
      '거래 플랫폼 (1차 조정)',
      '전자문서·전자거래분쟁조정위원회 (2차 조정)',
      '온라인피해 365센터 ☎142-235',
    ],
    actions: ['c365', 'consumer24', 'c1372', 'klac'],
    sources: ['easy2', 'easy3', 'easy1'],
    refund: {
      title: '환불·보상을 받으려면',
      items: [
        '합의가 어려우면 과학기술정보통신부·공정거래위원회의 「개인 간 거래 분쟁해결기준」을 참고할 수 있어요.',
        '3,000만 원 이하의 금전 청구라면 지급명령이나 소액사건심판으로 일반 재판보다 간단하고 빠르게 진행할 수 있어요.',
        '대한법률구조공단(☎132)에서 무료로 법률상담을 받을 수 있어요.',
      ],
    },
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
    actions: ['deposit'],
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
    actions: ['police112'],
  },
  '판단 어려움': {
    color: 'gray',
    title: '지금 정보로는 판단이 어려워요',
    note: '정해진 기준에 맞지 않아 분류하지 않았어요. 상담원이 함께 보는 것이 좋아요.',
    steps: [
      '온라인피해 365센터 상담원에게 연결하세요. 월~금 09:00~12:00, 13:00~18:00(점심시간 제외), ☎142-235 입니다.',
      '아래 증거 정리표를 상담원에게 보여 주면 같은 질문을 다시 받지 않아요.',
    ],
    institutions: ['온라인피해 365센터 ☎142-235'],
    actions: ['c365'],
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

function buildSheet(f, cls, x, institutions, opts) {
  const platform = opts && opts.platform ? opts.platform : '';
  const done = opts && Array.isArray(opts.done) ? opts.done : [];
  const app = x.app || (platform && platform !== '기타·모름' ? platform : '');
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
    `   - 거래 앱: ${valOr(app, '거래 앱')}`,
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
    '[9] 지금까지 한 일',
    `   ${check(done.includes('bank'))} 은행에 연락 (답변·연락 시각: 직접 적으세요)`,
    `   ${check(done.includes('police'))} 경찰에 신고 (접수번호·담당 경찰서: 직접 적으세요)`,
    `   ${check(done.includes('platform'))} 플랫폼에 신고 (접수 화면 캡처를 함께 가져가세요)`,
    '',
    '--------------------------------------------------',
    '※ 이 정리표는 안내용이며 법적 효력을 갖지 않습니다.',
    '※ 원본 캡처 파일을 함께 가져가세요.',
    '==================================================',
  ];
  return lines.join('\n');
}

// 거래한 곳·이미 한 일. 목록에 없는 값은 버린다.
function sanitizeOpts(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const platform = PLATFORMS.includes(o.platform) ? o.platform : '';
  const done = Array.isArray(o.done) ? DONE_KEYS.filter((k) => o.done.includes(k)) : [];
  return { platform, done };
}

// 이미 한 일과 겹치는 단계는 '기록해 두세요' 안내로 바꾼다.
function buildSteps(info, done) {
  return info.steps.map((s) => {
    const o = typeof s === 'string' ? { t: s } : s;
    return o.tag && done.includes(o.tag) && DONE_STEP[o.tag] ? DONE_STEP[o.tag] : o.t;
  });
}

// 진단 한 번에 필요한 것을 모두 처리한다.
function diagnose(rawFacts, rawExtra, crisis, rawOpts) {
  const facts = normalizeFacts(rawFacts);
  const opts = sanitizeOpts(rawOpts);
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
  if (cls.result === '거래 분쟁') {
    notes.push('환불·배송 지연·개인 간 다툼 같은 민사 문제는 경찰청 사이버범죄 신고센터로 접수할 수 없어요(법제처 생활법령정보).');
  }
  // 플랫폼별 안내는 중고거래 피해에서만 보여 준다. 이미 플랫폼에 신고했으면 위 단계에서 기록 안내로 바뀌므로 생략한다.
  const inScope = !OUT_OF_SCOPE[facts.situation];
  const guideSteps = opts.platform && PLATFORM_GUIDE[opts.platform];
  const platformGuide = inScope && guideSteps && !opts.done.includes('platform') && cls.result !== '판단 어려움'
    ? { platform: opts.platform, title: `${opts.platform === '기타·모름' ? '거래한 플랫폼' : opts.platform}에서 할 일`, steps: guideSteps }
    : null;
  return {
    status: 'done',
    crisis,
    facts,
    result: cls.result,
    rule: cls.rule,
    color: info.color,
    title: info.title,
    note: info.note,
    steps: buildSteps(info, opts.done),
    institutions: info.institutions,
    actions: (info.actions || []).map((k) => ACTIONS[k]),
    platformGuide,
    refund: info.refund || null,
    sources: (info.sources || []).map((k) => SRC[k]),
    notes,
    draft: cls.result === '거래 분쟁' ? DRAFT_MESSAGE : null,
    sheet: buildSheet(facts, cls, extra, info.institutions, opts),
    disclaimer: DISCLAIMER,
  };
}

module.exports = {
  ACTIONS,
  SRC,
  QUESTIONS,
  FACT_KEYS,
  VALUES,
  CRISIS_INFO,
  PLATFORMS,
  EXTRA_LIMITS,
  normalizeFacts,
  requiredMissing,
  classify,
  buildNarrative,
  diagnose,
};
