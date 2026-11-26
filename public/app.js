(function () {
  'use strict';

  // 시연 값: AI 없이 같은 결과를 보여 주는 고정 예시(중고거래 송금 후 잠적). 실제 AI 결과가 아니다.
  var DEMO = {
    situation: '중고거래 피해',
    payment: '계좌이체',
    receipt: '못 받음',
    contact: '판매 글·계정 사라짐',
    fakePost: '없음',
    itemKind: '실물',
  };
  var REQUIRED = ['situation', 'receipt', 'contact']; // 규칙표 분류에 꼭 필요한 항목('모름' 선택지를 뺀다)
  // 확인 화면에 보여 줄 항목. 규칙표 판단에 쓰이는 값(판매 글 정황 포함)은 모두 보여 주고 고칠 수 있게 한다.
  var SHORT = {
    situation: '상황',
    payment: '송금 방법',
    receipt: '수령 상태',
    contact: '연락 상태',
    fakePost: '판매 글 정황',
    itemKind: '상품 종류',
  };
  var PLACEHOLDER = '상황을 편하게 적어 주세요';
  // 내 컴퓨터에서 실행 중인지(개발용 안내를 보여 줄지) 판단한다
  var IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  // 정리표(진술서 초안)에 들어가는 추가 정보. 모두 건너뛸 수 있다.
  // 거래한 앱은 앞에서 버튼으로 이미 골랐고, 가격은 송금 금액과 겹쳐서 묻지 않는다(정리표에는 '확인 필요'로 남는다).
  var EXTRA = [
    { key: 'item', text: '산 물건의 이름을 알려 주세요. 예: 무선 이어폰' },
    { key: 'nick', text: '판매자의 닉네임이나 ID를 알려 주세요. 예: ○○마켓' },
    { key: 'date', text: '송금한 날짜와 시간을 알려 주세요. 예: 2026-10-02 14:10' },
    { key: 'amount', text: '송금한 금액은 얼마인가요? 예: 150,000원' },
    { key: 'bank', text: '입금한 은행 이름을 알려 주세요. 계좌번호는 신고할 때 직접 적으시면 돼요.' },
    { key: 'talk', text: '판매자와 나눈 대화의 요점을 적어 주세요(400자 이내). 예: 입금하면 내일 보낸다고 함, 이후 답이 없음' },
  ];
  var DONE_OPTIONS = [
    { key: 'bank', label: '은행에 연락했어요' },
    { key: 'police', label: '경찰에 신고했어요' },
    { key: 'platform', label: '거래 앱에 신고했어요' },
  ];

  // 첫 화면의 상황 카드. 누르면 해당 값을 미리 채우고, 나머지만 버튼으로 묻는다.
  // only 는 그 질문에서 보여 줄 선택지를 좁힌다(카드와 어긋나는 답을 고르지 않게).
  var CARDS = [
    // 카드로 이미 '못 받음'을 알았으니 수령 여부는 다시 묻지 않고, 판매자 상태 한 번으로 두 항목을 채운다.
    { title: '돈을 보냈는데 물건이 안 와요', sub: '송금한 뒤 연락이 끊겼거나 배송이 안 돼요',
      facts: { situation: '중고거래 피해' },
      combo: {
        label: '지금 판매자는 어떤 상태인가요?',
        options: [
          { label: '연락이 끊겼어요 (답 없음·차단)', facts: { receipt: '못 받음', contact: '답 없음·차단' } },
          { label: '판매 글이나 계정이 사라졌어요', facts: { receipt: '못 받음', contact: '판매 글·계정 사라짐' } },
          { label: '배송 중이라고만 하고 안 와요', facts: { receipt: '배송 중이라고 함', contact: '연락됨' } },
          { label: '연락은 되는데 계속 미뤄요', facts: { receipt: '못 받음', contact: '연락됨' } },
        ],
      } },
    { title: '받은 물건이 설명과 달라요', sub: '상태가 다르거나 다른 물건·파손품, 쓸 수 없는 쿠폰이 왔어요',
      facts: { situation: '중고거래 피해' },
      only: { receipt: ['설명과 상태가 다름', '전혀 다른 물건이 옴', '배송 중 파손', '쿠폰·번호가 이미 사용됨·없음'] } },
    { title: '다른 사람에게 잘못 보냈어요', sub: '계좌를 잘못 입력해 보낸 착오송금이에요',
      facts: { situation: '착오송금' } },
    { title: '보이스피싱 같은 다른 피해예요', sub: '중고거래가 아닌 사기·금융 피해예요',
      facts: { situation: '보이스피싱 등 다른 피해' } },
    { title: '잘 모르겠어요, 직접 적을게요', sub: '있었던 일을 적거나 대화 내용을 붙여넣어요', free: true },
  ];

  var st = {
    restrict: null,
    platform: '',
    platformAsked: false,
    done: [],
    doneAsked: false,
    platforms: ['당근', '번개장터', '중고나라', '기타·모름'],
    questions: [],
    crisisInfo: null,
    crisisWords: [],
    crisisPairs: [],
    intentWords: null,
    faq: [],
    faqFeatured: {},
    result: '',
    replyN: 0,
    facts: {},
    mode: 'button', // live(AI 정리) · demo(시연 값) · button(버튼으로 고른 값)
    answeredBy: null,
    stage: 'idle', // idle · ask(선택지 대기) · confirm(확인 대기) · extra(추가 정보) · done
    queue: [],
    askedPayment: false,
    extraDone: false,
    extra: {},
    extraIdx: 0,
    crisis: false,
    sheet: '',
    busy: false,
  };

  var chat, input, sendBtn;

  function $(id) { return document.getElementById(id); }

  function resetState() {
    st.restrict = null;
    st.result = '';
    st.platform = '';
    st.platformAsked = false;
    st.done = [];
    st.doneAsked = false;
    setStep(1);
    st.facts = {};
    st.mode = 'button';
    st.answeredBy = null;
    st.stage = 'idle';
    st.queue = [];
    st.askedPayment = false;
    st.extraDone = false;
    st.extra = {};
    st.extraIdx = 0;
    st.crisis = false;
    st.sheet = '';
    $('crisisStatic').classList.remove('alert');
  }

  function blankFacts() {
    var o = {};
    st.questions.forEach(function (q) { o[q.key] = '모름'; });
    return o;
  }

  // 위쪽 진행 표시. n 번째 단계가 지금 단계이고 앞 단계는 끝난 것으로 보여 준다.
  function setStep(n) {
    document.querySelectorAll('#steps li').forEach(function (li, i) {
      li.classList.toggle('done', i + 1 < n);
      li.classList.toggle('on', i + 1 === n);
    });
  }

  function showHome() {
    $('home').hidden = false;
    $('chatView').hidden = true;
    window.scrollTo(0, 0);
  }

  function showChat() {
    $('home').hidden = true;
    $('chatView').hidden = false;
    window.scrollTo(0, 0);
  }

  function renderCards() {
    var box = $('cards');
    CARDS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'card-btn' + (c.free ? ' ghost' : '');
      var t = document.createElement('span');
      t.className = 'card-btn-title';
      t.textContent = c.title;
      var s = document.createElement('span');
      s.className = 'card-btn-sub';
      s.textContent = c.sub;
      var wrap = document.createElement('span');
      wrap.appendChild(t);
      wrap.appendChild(s);
      b.appendChild(wrap);
      b.disabled = true; // 질문 목록을 받기 전에 누르면 흐름이 꼬이므로, init() 이 목록을 받은 뒤에 연다
      b.addEventListener('click', function () { startCard(c); });
      box.appendChild(b);
    });
  }

  function startCard(c) {
    resetState();
    chat.textContent = '';
    showChat();
    if (c.free) {
      bot('편하게 적어 주세요. 있었던 일을 적거나 판매자와 나눈 대화를 그대로 붙여넣어도 돼요.\n전화번호·계좌번호·주소는 자동으로 가려서 정리해요. 통화 녹음은 파일 대신 글로 옮긴 내용을 붙여넣어 주세요.');
      var r = bot('글쓰기가 어려우면 버튼으로 고를 수도 있어요.');
      chipsIn(r, [{ label: '버튼으로 고를게요', onPick: function () { st.mode = 'button'; st.facts = blankFacts(); proceed(); } }]);
      input.focus({ preventScroll: true });
      return;
    }
    st.mode = 'button';
    st.facts = Object.assign(blankFacts(), c.facts);
    st.restrict = c.only || null;
    me(c.title);
    if (c.combo) {
      st.stage = 'ask';
      var r = bot(c.combo.label);
      chipsIn(r, c.combo.options.map(function (o) {
        return { label: o.label, onPick: function () {
          Object.assign(st.facts, o.facts);
          st.stage = 'idle';
          proceed();
        } };
      }));
      return;
    }
    bot('알겠어요. 몇 가지만 더 확인할게요.');
    proceed();
  }

  function setBusy(b) {
    st.busy = b;
    sendBtn.disabled = b;
  }

  async function api(path, body) {
    var opts = body
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {};
    var res;
    try {
      res = await fetch(path, opts);
    } catch (e) {
      // 서버가 꺼져 있거나 다른 주소로 열었을 때 브라우저는 "Failed to fetch" 만 보여 준다.
      throw new Error(IS_LOCAL
        ? '서버에 연결하지 못했어요. 터미널에서 npm start 가 켜져 있는지, 주소가 http://localhost:3000 인지 확인해 주세요.'
        : '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 잠시 뒤 다시 시도해 주세요.');
    }
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    return data;
  }

  // ----- 말풍선 -----
  // 대화창 안에서만 스크롤한다(페이지 전체는 움직이지 않는다).
  // 새 말풍선이 창보다 크면 맨 위부터 보이게 하고, 아니면 맨 아래로 내린다.
  function scrollToRow(r) {
    var tall = r.offsetHeight > chat.clientHeight - 24;
    chat.scrollTo({ top: tall ? Math.max(r.offsetTop - 8, 0) : chat.scrollHeight, behavior: 'smooth' });
  }

  function row(who, node, keepScroll) {
    var r = document.createElement('div');
    r.className = 'msg ' + who;
    r.appendChild(node);
    chat.appendChild(r);
    if (!keepScroll) scrollToRow(r);
    return r;
  }

  function bubbleEl(text, cls) {
    var b = document.createElement('div');
    b.className = 'bubble' + (cls ? ' ' + cls : '');
    b.textContent = text;
    return b;
  }

  function bot(text, cls) { return row('bot', bubbleEl(text, cls)); }

  function me(text) { return row('me', bubbleEl(text)); }

  // 선택 버튼을 말풍선 안에 붙인다. 고르면 내 말풍선으로 남기고 나머지는 잠근다.
  function chipsIn(r, options) {
    var group = document.createElement('div');
    group.className = 'chips';
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = o.label;
      b.addEventListener('click', function () {
        group.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
        b.setAttribute('aria-pressed', 'true');
        if (o.echo !== false) me(o.label);
        o.onPick();
      });
      group.appendChild(b);
    });
    r.querySelector('.bubble').appendChild(group);
  }

  // 위기 표현 검사. 단어 목록은 서버(lib/crisis.js)에서 받아 와서 서버와 같은 방식으로 본다.
  function hasCrisis(text) {
    var compact = String(text || '').replace(/\s+/g, '');
    var hit = st.crisisWords.some(function (w) { return compact.indexOf(w.replace(/\s+/g, '')) >= 0; });
    if (hit) return true;
    return st.crisisPairs.some(function (p) { return compact.indexOf(p[0]) >= 0 && compact.indexOf(p[1]) >= 0; });
  }

  // 위기 표현이 보이면 다른 안내보다 먼저 109 를 띄운다.
  function flagCrisis() {
    st.crisis = true;
    $('crisisStatic').classList.add('alert');
    crisisBubble();
  }

  function crisisBubble() {
    var b = document.createElement('div');
    b.className = 'bubble crisis';
    var t = document.createElement('p');
    t.className = 'bubble-title';
    t.textContent = st.crisisInfo ? st.crisisInfo.title : '지금 많이 힘드시다면 도움을 받으세요';
    var p = document.createElement('p');
    p.textContent = st.crisisInfo ? st.crisisInfo.text : '자살예방 상담전화 109 로 바로 연결할 수 있어요.';
    b.appendChild(t);
    b.appendChild(p);
    row('bot', b);
  }

  // ----- 감정·감사·추가 질문 -----
  // 사건 설명이 아닌 말(고맙다, 힘들다, 질문)을 사건으로 오인하지 않고 따로 받는다. 단어 목록은 서버(lib/intent.js)에서 받는다.
  // 분류 규칙은 lib/intent.js 의 classify 와 같다. 한쪽을 고치면 다른 쪽도 고친다.
  var C365 = { label: '온라인피해 365센터', tel: '142-235', url: 'https://www.helpos.kr', note: '월~금 09:00~12:00, 13:00~18:00 (수신자 부담)' };
  var KLAC = { label: '대한법률구조공단 법률상담', tel: '132', url: 'https://www.klac.or.kr', note: '무료 법률상담' };
  var FEELING_REPLIES = [
    '많이 힘드셨겠어요. 서두르지 않으셔도 돼요. 할 수 있는 것부터 하나씩 같이 볼게요.',
    '그런 일을 겪으면 속상하고 막막한 게 당연해요. 천천히 해도 괜찮아요.',
    '혼자 감당하기 쉽지 않은 일이에요. 지금 할 수 있는 것부터 같이 확인해 볼게요.',
  ];
  var CASE_EMPATHY = [
    '많이 놀라고 속상하셨겠어요. 있었던 일부터 같이 정리해 볼게요.',
    '힘든 일을 겪으셨네요. 차근차근 같이 정리해 볼게요.',
  ];
  var THANKS_REPLIES = [
    '도움이 되었다니 다행이에요. 정리표를 챙겨서 필요한 곳에 꼭 연락해 보세요.',
    '네, 잘 해결되길 바라요. 기관에 연락할 때 정리표를 함께 가져가세요.',
  ];

  function pick(list) {
    var s = list[st.replyN % list.length];
    st.replyN += 1;
    return s;
  }

  function classifyInput(text) {
    var w = st.intentWords;
    if (!w) return { kind: 'case', feeling: false };
    var compact = String(text || '').replace(/\s+/g, '');
    function any(list) {
      return list.some(function (x) { return compact.indexOf(x.replace(/\s+/g, '')) >= 0; });
    }
    var feeling = any(w.feeling);
    if (compact.length >= w.longText || any(w.event)) return { kind: 'case', feeling: feeling };
    if (any(w.thanks)) return { kind: 'thanks', feeling: false };
    if (feeling) return { kind: 'feeling', feeling: true };
    if (any(w.question)) return { kind: 'question', feeling: false };
    if (any(w.hello)) return { kind: 'hello', feeling: false };
    // 아무 신호가 없는 짧은 말(weak). 대기·결과 뒤에는 자주 묻는 질문 단어가 있으면 질문으로 본다(onSend).
    return { kind: 'case', feeling: false, weak: true };
  }

  // 말풍선 아래에 전화·누리집 연결 카드를 붙인다.
  function botWithActions(text, actions) {
    var b = bubbleEl(text);
    actions.forEach(function (a) {
      var c = actionCard(a);
      c.style.marginTop = '10px';
      b.appendChild(c);
    });
    return row('bot', b);
  }

  // ----- 자주 묻는 질문 -----
  // 질문과 맞는 항목을 키워드로 찾는다. 진단 결과가 있으면 그 결과에 맞는 항목에 점수를 조금 더 준다.
  function matchFaq(text) {
    var compact = String(text || '').replace(/\s+/g, '');
    var scored = [];
    st.faq.forEach(function (it) {
      var score = 0;
      it.keywords.forEach(function (k) {
        var kk = k.replace(/\s+/g, '');
        if (compact.indexOf(kk) >= 0) score += kk.length;
      });
      if (score && st.result && it.forResults && it.forResults.indexOf(st.result) >= 0) score += 1;
      if (score) scored.push({ it: it, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.map(function (x) { return x.it; });
  }

  // 결과별로 먼저 보여 줄 질문들(이미 답한 질문은 뺀다)
  function featuredFaq(skipId, limit) {
    var ids = st.faqFeatured[st.result] || st.faqFeatured.DEFAULT || [];
    return ids.map(function (id) {
      return st.faq.find(function (x) { return x.id === id; });
    }).filter(function (x) { return x && x.id !== skipId; }).slice(0, limit);
  }

  // 질문 버튼 묶음. 한 번 눌러도 잠기지 않아서 이어서 다른 질문을 볼 수 있다.
  function faqChips(r, items) {
    if (!items.length) return;
    var group = el('div', 'chips');
    items.forEach(function (it) {
      var b = el('button', 'chip', it.q);
      b.type = 'button';
      b.addEventListener('click', function () { me(it.q); answerFaq(it); });
      group.appendChild(b);
    });
    r.querySelector('.bubble').appendChild(group);
  }

  function answerFaq(it) {
    var b = el('div', 'bubble faq-bubble');
    b.appendChild(el('p', 'bubble-title', it.q));
    var paras = (it.byResult && st.result && it.byResult[st.result]) || it.answer;
    paras.forEach(function (t) { b.appendChild(el('p', 'faq-p', t)); });
    it.actions.forEach(function (a) { b.appendChild(actionCard(a)); });
    var note = el('p', 'faq-note');
    note.appendChild(document.createTextNode('※ 참고 정보이며 법적 판단이 아니에요. 근거: '));
    it.sources.forEach(function (s, i) {
      if (i) note.appendChild(document.createTextNode(' · '));
      var a = el('a', '', s.name);
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      note.appendChild(a);
    });
    b.appendChild(note);
    var r = row('bot', b);
    var more = matchFaq(it.q).filter(function (x) { return x.id !== it.id; }).slice(0, 2);
    if (!more.length) more = featuredFaq(it.id, 3);
    if (more.length) {
      var r2 = bot('이런 질문도 많이 해요.');
      faqChips(r2, more);
    }
    // 답이 길어도 위에서부터 읽을 수 있게, 뒤에 붙인 질문 버튼이 아니라 답의 맨 위로 맞춘다.
    scrollToRow(r);
    return r;
  }

  // 사건 설명이 아닌 말에 답한다. 상태(질문 진행, 결과)는 건드리지 않는다.
  function respondOther(kind, text) {
    if (kind === 'feeling') {
      bot(pick(FEELING_REPLIES));
      botWithActions('말로 상담받고 싶으시면 전화로 이야기할 수도 있어요.', [C365]);
    } else if (kind === 'thanks') {
      bot(pick(THANKS_REPLIES));
    } else if (kind === 'hello') {
      bot('안녕하세요. 어떤 일이 있었는지 편하게 적어 주시거나, 처음 화면에서 상황을 골라 주세요.');
    } else {
      var m = matchFaq(text);
      if (m.length) {
        answerFaq(m[0]);
      } else {
        // 근거 문서에 없는 질문은 아는 척하지 않고 상담 창구로 연결한다.
        var r = botWithActions('이 질문은 근거 문서에서 찾지 못했어요. 아래 상담 창구에서 확인하실 수 있어요.', [C365, KLAC]);
        faqChips(r, featuredFaq('', 4));
      }
    }
  }

  // 이전 질문의 선택 버튼을 잠근다(같은 질문을 다시 보여 줄 때 버튼이 겹쳐 눌리지 않게).
  function lockChips() {
    chat.querySelectorAll('.chip:not([disabled])').forEach(function (b) { b.disabled = true; });
  }

  // ----- 흐름 -----
  function onDemo() {
    resetState();
    chat.textContent = '';
    showChat();
    me('예시 결과 보기');
    st.mode = 'demo';
    st.facts = Object.assign({}, DEMO);
    confirmFacts();
  }

  function sourceLabel() {
    if (st.mode === 'demo') return '시연 값';
    if (st.mode === 'live') return 'AI(' + st.answeredBy + ')가 정리한 내용';
    return '버튼으로 고른 내용';
  }

  function confirmFacts() {
    st.stage = 'confirm';
    var b = document.createElement('div');
    b.className = 'bubble facts-bubble';
    var t = document.createElement('p');
    t.className = 'bubble-title';
    t.textContent = '이렇게 이해했어요 (' + sourceLabel() + ')';
    b.appendChild(t);
    var dl = document.createElement('dl');
    dl.className = 'facts';
    Object.keys(SHORT).forEach(function (k) {
      var rowEl = document.createElement('div');
      rowEl.className = 'fact-row';
      var dt = document.createElement('dt');
      dt.textContent = SHORT[k];
      var dd = document.createElement('dd');
      dd.textContent = st.facts[k];
      rowEl.appendChild(dt);
      rowEl.appendChild(dd);
      dl.appendChild(rowEl);
    });
    b.appendChild(dl);
    var r = row('bot', b);
    chipsIn(r, [
      { label: '맞아요', onPick: function () { st.stage = 'idle'; proceed(); } },
      { label: '고칠래요', onPick: function () {
        st.stage = 'idle';
        st.queue = ['situation', 'payment', 'receipt', 'contact', 'fakePost', 'itemKind'];
        continueFlow();
      } },
    ]);
  }

  function askQuestion(key) {
    var q = st.questions.find(function (x) { return x.key === key; });
    if (!q) { proceed(); return; }
    st.stage = 'ask';
    if (key === 'payment') st.askedPayment = true;
    var only = st.restrict && st.restrict[key];
    var values = q.values.filter(function (v) {
      if (only) return only.indexOf(v) >= 0;
      return !(REQUIRED.indexOf(key) >= 0 && v === '모름');
    });
    var r = bot(q.label);
    chipsIn(r, values.map(function (v) {
      return { label: v, onPick: function () {
        st.facts[key] = v;
        st.mode = 'button';
        st.stage = 'idle';
        continueFlow();
      } };
    }));
  }

  // 대기 중인 질문이 있으면 다음 질문을, 없으면 진단 단계로 넘어간다.
  function continueFlow() {
    if (st.queue.length) askQuestion(st.queue.shift());
    else proceed();
  }

  async function proceed() {
    setBusy(true);
    try {
      var d = await api('/api/diagnose', { facts: st.facts, extra: st.extra, crisis: st.crisis, platform: st.platform, done: st.done });
      if (d.status === 'need') { askQuestion(d.missing[0]); return; }
      // 범위 밖(착오송금·보이스피싱 등)은 중고거래용 질문(송금 방법·거래한 곳·정리표 항목)을 하지 않고 바로 결과를 보여 준다.
      var outOfScope = /^범위 밖/.test(d.result);
      if (!outOfScope && !st.askedPayment && st.facts.payment === '모름') { askQuestion('payment'); return; }
      if (!outOfScope && !st.platformAsked) { askPlatform(); return; }
      if (!outOfScope && !st.doneAsked) { askDone(); return; }
      if (!st.extraDone) {
        if (outOfScope) { fillExtra(); renderResult(d); return; }
        offerExtra();
        return;
      }
      renderResult(d);
    } catch (e) {
      bot('진단 중 문제가 생겼어요: ' + e.message);
      st.stage = 'idle';
    } finally {
      setBusy(false);
    }
  }

  // 어디서 거래했는지 묻는다. 당근·번개장터·중고나라는 신고 방법이 달라서, 맞는 방법을 알려 주려고 묻는다.
  function askPlatform() {
    st.stage = 'ask';
    st.platformAsked = true;
    var r = bot('어디에서 거래하셨나요?\n거래한 곳마다 신고 방법이 달라서, 맞는 방법을 알려 드릴게요.');
    chipsIn(r, st.platforms.map(function (p) {
      return { label: p, onPick: function () { st.platform = p; st.stage = 'idle'; proceed(); } };
    }));
  }

  // 이미 한 일을 모두 고르게 한다. 한 일은 다시 시키지 않고 기록만 남기게 안내한다.
  function askDone() {
    st.stage = 'ask';
    st.doneAsked = true;
    var r = bot('지금까지 해 본 일이 있으면 모두 눌러 주세요. 없으면 바로 "다음"을 누르세요.');
    var group = document.createElement('div');
    group.className = 'chips';
    DONE_OPTIONS.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = o.label;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      });
      group.appendChild(b);
    });
    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'chip chip-next';
    next.textContent = '다음';
    next.addEventListener('click', function () {
      var picked = [];
      var labels = [];
      group.querySelectorAll('button.chip').forEach(function (btn, i) {
        if (i < DONE_OPTIONS.length && btn.getAttribute('aria-pressed') === 'true') {
          picked.push(DONE_OPTIONS[i].key);
          labels.push(DONE_OPTIONS[i].label);
        }
      });
      group.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
      st.done = picked;
      me(labels.length ? labels.join(', ') : '아직 없어요');
      st.stage = 'idle';
      proceed();
    });
    group.appendChild(next);
    r.querySelector('.bubble').appendChild(group);
  }

  // 정리표를 더 채울지 먼저 묻는다. 결과는 이 질문과 상관없이 바로 볼 수 있다.
  function offerExtra() {
    st.stage = 'ask';
    var r = bot('여기까지 답해 주셨으면 결과를 바로 볼 수 있어요.\n기관에 가져갈 증거 정리표를 더 자세히 채우려면 ' + EXTRA.length + '가지만 더 적어 주세요. 모두 건너뛸 수 있어요.');
    chipsIn(r, [
      { label: '결과 먼저 볼래요', onPick: function () { finishExtra(); } },
      { label: '정리표 채울게요', onPick: function () { startExtra(); } },
    ]);
  }

  function startExtra() {
    st.stage = 'extra';
    st.extraIdx = 0;
    askExtra();
  }

  function askExtra() {
    var s = EXTRA[st.extraIdx];
    input.placeholder = '입력하거나 건너뛰기를 눌러 주세요';
    var r = bot('(' + (st.extraIdx + 1) + '/' + EXTRA.length + ') ' + s.text);
    chipsIn(r, [
      { label: '건너뛰기', onPick: function () { answerExtra(''); } },
      { label: '여기까지만 할게요', onPick: function () { finishExtra(); } },
    ]);
  }

  // 아직 안 채운 정리표 항목을 모두 비운다.
  function fillExtra() {
    for (var i = st.extraIdx; i < EXTRA.length; i++) {
      if (st.extra[EXTRA[i].key] === undefined) st.extra[EXTRA[i].key] = '';
    }
    st.extraIdx = EXTRA.length;
    input.placeholder = PLACEHOLDER;
    st.stage = 'idle';
    st.extraDone = true;
  }

  // 남은 추가 질문을 모두 비우고 진단으로 넘어간다.
  function finishExtra() {
    fillExtra();
    proceed();
  }

  function answerExtra(text) {
    // 글자 수 제한은 서버(lib/rules.js EXTRA_LIMITS)에서 항목마다 다르게 한다. 대화 요점은 400자.
    st.extra[EXTRA[st.extraIdx].key] = text;
    st.extraIdx += 1;
    if (st.extraIdx < EXTRA.length) {
      askExtra();
      return;
    }
    input.placeholder = PLACEHOLDER;
    st.stage = 'idle';
    st.extraDone = true;
    proceed();
  }

  // 개인정보를 가린 결과를 보여 준다. 무엇이 어떻게 가려졌는지 피해자가 직접 볼 수 있게 한다.
  function showRedaction(d) {
    var red = d.redaction;
    if (!red || !red.total) return;
    var names = Object.keys(red.counts).map(function (k) { return k + ' ' + red.counts[k] + '건'; });
    bot('개인정보 ' + red.total + '건을 가린 뒤에 정리했어요 (' + names.join(', ') + ').');
    var b = document.createElement('div');
    b.className = 'bubble wide';
    var t = document.createElement('p');
    t.className = 'bubble-title';
    t.textContent = '정리에 쓴 내용 (가린 뒤):';
    var pre = document.createElement('pre');
    pre.className = 'sheet';
    pre.textContent = red.maskedText;
    b.appendChild(t);
    b.appendChild(pre);
    row('bot', b);
  }

  async function extract(text) {
    setBusy(true);
    var thinking = bot('정리하는 중이에요…');
    try {
      var d = await api('/api/extract', { text: text });
      thinking.remove();
      showRedaction(d);
      if (d.crisis && !st.crisis) flagCrisis();
      if (d.facts) {
        st.facts = d.facts;
        st.mode = 'live';
        st.answeredBy = d.answeredBy;
        confirmFacts();
      } else {
        // 키·승인 상태 같은 내부 사정은 내 컴퓨터에서 점검할 때만 보여 준다.
        var why = (d.attempts || []).map(function (a) { return a.name + ': ' + a.reason; }).join(' · ');
        bot(IS_LOCAL
          ? 'AI를 쓸 수 없어서 버튼으로 여쭤볼게요. (점검용: ' + why + ')'
          : '지금은 문장 정리를 할 수 없어서 버튼으로 여쭤볼게요.');
        st.mode = 'button';
        st.facts = blankFacts();
        setBusy(false);
        proceed();
      }
    } catch (e) {
      thinking.remove();
      bot('정리 중 문제가 생겼어요: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // 클립보드에 복사한다. 막혀 있으면 임시 입력창으로 한 번 더 시도한다.
  function copyText(text, btn) {
    var label = btn.textContent;
    function ok() { btn.textContent = '복사했어요'; setTimeout(function () { btn.textContent = label; }, 2000); }
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var done = document.execCommand('copy');
        ta.remove();
        if (done) ok(); else btn.textContent = '복사하지 못했어요. 직접 선택해 주세요';
      } catch (e) {
        btn.textContent = '복사하지 못했어요. 직접 선택해 주세요';
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, fallback);
    } else {
      fallback();
    }
  }

  // 전화·누리집으로 바로 연결하는 카드
  function actionCard(a) {
    var box = el('div', 'action');
    var txt = el('div', 'action-text');
    txt.appendChild(el('strong', '', a.label));
    if (a.note) txt.appendChild(el('span', '', a.note));
    box.appendChild(txt);
    var btns = el('div', 'action-btns');
    if (a.tel) {
      var t = el('a', 'btn-link', '☎ ' + a.tel + ' 전화');
      t.href = 'tel:' + a.tel.replace(/[^0-9]/g, '');
      btns.appendChild(t);
    }
    if (a.url) {
      var u = el('a', 'btn-link ghost', '누리집 열기');
      u.href = a.url;
      u.target = '_blank';
      u.rel = 'noopener noreferrer';
      btns.appendChild(u);
    }
    box.appendChild(btns);
    return box;
  }

  function renderResult(d) {
    st.stage = 'done';
    st.result = d.result;
    st.sheet = d.sheet;

    setStep(3);

    var card = el('div', 'result-card ' + d.color);
    card.appendChild(el('p', 'result-label', '안내 결과 · ' + d.result));
    card.appendChild(el('h2', '', d.title));
    card.appendChild(el('p', 'result-note', d.note));

    card.appendChild(el('h3', '', '지금 할 일'));
    var ol = el('ol', 'steps');
    d.steps.forEach(function (s) { ol.appendChild(el('li', '', s)); });
    card.appendChild(ol);

    if (d.actions && d.actions.length) {
      card.appendChild(el('h3', '', '바로 연결하기'));
      var acts = el('div', 'actions');
      d.actions.forEach(function (a) { acts.appendChild(actionCard(a)); });
      card.appendChild(acts);
    }

    if (d.platformGuide) {
      card.appendChild(el('h3', '', d.platformGuide.title));
      var gl = el('ul', 'guide-list');
      d.platformGuide.steps.forEach(function (s) { gl.appendChild(el('li', '', s)); });
      card.appendChild(gl);
    }

    if (d.refund) {
      card.appendChild(el('h3', '', d.refund.title));
      var rl = el('ul', 'guide-list');
      d.refund.items.forEach(function (s) { rl.appendChild(el('li', '', s)); });
      card.appendChild(rl);
    }

    if (d.draft) {
      var fold = el('details', 'fold');
      fold.appendChild(el('summary', '', '판매자에게 보낼 요청 메시지 초안 보기'));
      fold.appendChild(el('pre', 'sheet', d.draft));
      var cp = el('button', 'btn-link copy', '초안 복사');
      cp.type = 'button';
      cp.addEventListener('click', function () { copyText(d.draft, cp); });
      fold.appendChild(cp);
      card.appendChild(fold);
    }
    (d.notes || []).forEach(function (n) { card.appendChild(el('p', 'notes', n)); });

    if (d.sources && d.sources.length) {
      var src = el('details', 'fold sources');
      src.appendChild(el('summary', '', '근거 자료 보기'));
      var sl = el('ul', 'guide-list');
      d.sources.forEach(function (s) {
        var li = el('li');
        var a = el('a', '', s.name);
        a.href = s.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        li.appendChild(a);
        sl.appendChild(li);
      });
      src.appendChild(sl);
      card.appendChild(src);
    }
    // 어떤 근거로 나온 결과인지(규칙 번호, 정리 방식)는 작게 남긴다.
    card.appendChild(el('p', 'result-meta', (d.rule ? '적용 규칙 ' + d.rule + ' · ' : '') + sourceLabel()));

    var wide = el('div', 'bubble wide');
    wide.appendChild(card);
    var resultRow = row('bot', wide);

    var sheetBox = el('div', 'bubble wide');
    var box = el('div', 'sheet-box');
    box.appendChild(el('p', 'bubble-title', '증거 정리표'));
    box.appendChild(el('p', 'hint', '내려받아 기관에 가져가세요. 제출은 직접 하셔야 해요.'));
    var fold2 = el('details', 'fold');
    fold2.appendChild(el('summary', '', '정리표 내용 확인하기'));
    fold2.appendChild(el('pre', 'sheet', st.sheet));
    box.appendChild(fold2);
    var dl = el('button', 'btn btn-primary btn-block', '정리표 내려받기 (.txt)');
    dl.type = 'button';
    dl.addEventListener('click', onDownload);
    box.appendChild(dl);
    var cpSheet = el('button', 'btn-link copy', '정리표 전체 복사');
    cpSheet.type = 'button';
    cpSheet.addEventListener('click', function () { copyText(st.sheet, cpSheet); });
    box.appendChild(cpSheet);
    sheetBox.appendChild(box);
    row('bot', sheetBox);

    bot(d.disclaimer, 'muted');
    var faqRow = bot('더 궁금한 게 있으면 눌러 보세요. 직접 물어보셔도 돼요.');
    faqChips(faqRow, featuredFaq('', 5));
    var r = bot('다른 상황도 확인해 보시겠어요?');
    chipsIn(r, [{ label: '처음으로 돌아가기', onPick: restartAll }]);
    // 결과 카드가 길어서 맨 아래로 내리지 않고, 결과의 맨 위부터 보이게 한다.
    scrollToRow(resultRow);
  }

  function onDownload() {
    if (!st.sheet) return;
    var blob = new Blob(['﻿' + st.sheet], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '중고거래_피해_증거정리표.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function restartAll() {
    chat.textContent = '';
    resetState();
    showHome();
  }

  async function onSend(e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || st.busy) return;
    input.value = '';
    // 문장 정리(/api/extract)를 거치지 않는 단계에서도 위기 표현을 먼저 검사한다(기획서: 모든 입력에서 먼저 감지).
    var crisis = hasCrisis(text);
    var c = classifyInput(text);
    // 물음표 없이 쓴 질문("지급정지가 안 된대요")이 새 사건으로 오인되어 진행 상태를 지우지 않게 한다.
    // 정리표·선택지 질문 중에는 짧은 답(예: 물건 이름)과 헷갈리므로 적용하지 않는다.
    if (c.weak && st.stage !== 'extra' && st.stage !== 'ask' && st.stage !== 'confirm' && matchFaq(text).length) {
      c = { kind: 'question', feeling: false };
    }
    if (st.stage === 'extra') {
      me(text);
      if (crisis) flagCrisis();
      if (c.kind !== 'case' || crisis) {
        // 고맙다·힘들다·질문은 정리표 답으로 저장하지 않는다. 답하고 같은 질문을 다시 보여 준다.
        if (!crisis) respondOther(c.kind, text);
        lockChips();
        askExtra();
        return;
      }
      answerExtra(text);
      return;
    }
    if (st.stage === 'ask' || st.stage === 'confirm') {
      me(text);
      if (crisis) {
        flagCrisis();
        bot('안내를 먼저 확인해 주세요. 원하시면 위 선택지를 골라 이어서 진행할 수 있어요.');
        return;
      }
      if (c.kind !== 'case') {
        respondOther(c.kind, text);
        bot('위 선택지에서 이어서 골라 주세요.');
        return;
      }
      bot('위 선택지 중에서 골라 주세요. 처음부터 다시 하려면 아래 버튼을 눌러 주세요.');
      return;
    }
    // 대기·결과 뒤: 사건 설명이 아니면 상태를 지우지 않고 답만 한다.
    if (c.kind !== 'case') {
      me(text);
      if (crisis) flagCrisis();
      else respondOther(c.kind, text);
      return;
    }
    if (st.stage === 'done') {
      // 결과 뒤에 새로 적으면 이전 기록은 두고 새 상황으로 다시 정리한다.
      resetState();
    }
    me(text);
    // 감정이 섞인 사건 설명은 공감 한 줄을 먼저 붙인다(위기 표현이면 109 안내가 우선이라 붙이지 않는다).
    // 위기 표현은 문장 정리(서버·AI) 응답을 기다리지 않고 109 안내를 바로 띄운다.
    if (crisis) flagCrisis();
    else if (c.feeling) bot(pick(CASE_EMPATHY));
    extract(text);
  }

  async function init() {
    chat = $('chat');
    input = $('input');
    sendBtn = $('send');
    $('composer').addEventListener('submit', onSend);
    $('backBtn').addEventListener('click', restartAll);
    $('demoBtn').addEventListener('click', onDemo);
    renderCards();
    $('demoBtn').disabled = true;
    // 입력창: Enter 로 보내고, Shift+Enter 로 줄을 바꾼다
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        $('composer').requestSubmit();
      }
    });
    try {
      var meta = await api('/api/diagnose');
      st.questions = meta.questions;
      st.crisisInfo = meta.crisisInfo;
      if (meta.platforms) st.platforms = meta.platforms;
      st.crisisWords = meta.crisisWords || [];
      st.crisisPairs = meta.crisisPairs || [];
      st.intentWords = meta.intentWords || null;
      st.faq = meta.faq || [];
      st.faqFeatured = meta.faqFeatured || {};
      resetState();
      document.querySelectorAll('.card-btn').forEach(function (x) { x.disabled = false; });
      $('demoBtn').disabled = false;
      showHome();
    } catch (e) {
      showChat();
      bot('화면을 불러오지 못했어요: ' + e.message);
    }
  }

  init();
})();
