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
  var PLACEHOLDER = '상황을 편하게 적어 주세요 (대화 내용도 붙여넣을 수 있어요)';
  // 내 컴퓨터에서 실행 중인지(개발용 안내를 보여 줄지) 판단한다
  var IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  // 정리표(진술서 초안)에 들어가는 추가 정보. 모두 건너뛸 수 있다.
  var EXTRA = [
    { key: 'item', text: '산 물건의 이름을 알려 주세요. 예: 무선 이어폰' },
    { key: 'price', text: '물건 가격은 얼마였나요? 예: 150,000원' },
    { key: 'postDate', text: '판매 글은 언제 올라온 글이었나요? 예: 2026-09-30' },
    { key: 'app', text: '거래한 앱 이름을 알려 주세요. 예: ○○ 중고거래 앱' },
    { key: 'nick', text: '판매자의 닉네임이나 ID를 알려 주세요. 예: ○○마켓' },
    { key: 'date', text: '송금한 날짜와 시간을 알려 주세요. 예: 2026-10-02 14:10' },
    { key: 'amount', text: '송금한 금액은 얼마인가요? 예: 150,000원' },
    { key: 'bank', text: '입금한 은행 이름을 알려 주세요. 계좌번호는 신고할 때 직접 적으시면 돼요.' },
    { key: 'talk', text: '판매자와 나눈 대화의 요점을 적어 주세요(400자 이내). 예: 입금하면 내일 보낸다고 함, 이후 답이 없음' },
  ];

  var st = {
    questions: [],
    crisisInfo: null,
    crisisWords: [],
    crisisPairs: [],
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
  function row(who, node) {
    var r = document.createElement('div');
    r.className = 'msg ' + who;
    r.appendChild(node);
    chat.appendChild(r);
    r.scrollIntoView({ behavior: 'smooth', block: 'end' });
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

  // ----- 흐름 -----
  function greet() {
    bot('안녕하세요. 중고거래 피해 대응 길잡이예요.\n어떤 일이 있었는지 아래 입력창에 편하게 적어 주세요. 사기인지 판정하지는 않고, 어디에 먼저 가야 하는지 안내해 드려요.\n돈·비밀번호·인증번호는 묻지 않아요.');
    var r = bot('또는 버튼으로 하나씩 골라도 돼요.');
    chipsIn(r, [
      { label: '버튼으로 고를게요', onPick: function () { st.mode = 'button'; st.facts = blankFacts(); proceed(); } },
      { label: '대화 내용 붙여넣을게요', onPick: function () {
        bot('대화 내용을 아래 입력창에 붙여넣어 주세요. 전화번호·계좌번호·주소 같은 개인정보는 자동으로 가려서 정리해요.\n통화 녹음은 파일을 올리지 말고, 글로 바꾼 내용을 붙여넣어 주세요.');
      } },
      { label: '시연 값으로 보기', echo: true, onPick: onDemo },
    ]);
  }

  function onDemo() {
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
    b.className = 'bubble';
    var t = document.createElement('p');
    t.className = 'bubble-title';
    t.textContent = '이렇게 이해했어요 (' + sourceLabel() + ')';
    b.appendChild(t);
    Object.keys(SHORT).forEach(function (k) {
      var p = document.createElement('p');
      p.className = 'summary';
      p.textContent = SHORT[k] + ': ' + st.facts[k];
      b.appendChild(p);
    });
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
    var values = q.values.filter(function (v) {
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
      var d = await api('/api/diagnose', { facts: st.facts, extra: st.extra, crisis: st.crisis });
      if (d.status === 'need') { askQuestion(d.missing[0]); return; }
      if (!st.askedPayment && st.facts.payment === '모름') { askQuestion('payment'); return; }
      if (!st.extraDone) { startExtra(); return; }
      renderResult(d);
    } catch (e) {
      bot('진단 중 문제가 생겼어요: ' + e.message);
      st.stage = 'idle';
    } finally {
      setBusy(false);
    }
  }

  function startExtra() {
    st.stage = 'extra';
    st.extraIdx = 0;
    askExtra();
  }

  function askExtra() {
    var s = EXTRA[st.extraIdx];
    input.placeholder = '입력하거나 건너뛰기를 눌러 주세요';
    var r = bot(s.text);
    chipsIn(r, [
      { label: '건너뛰기', onPick: function () { answerExtra(''); } },
      { label: '나머지 건너뛰기', onPick: function () { finishExtra(); } },
    ]);
  }

  // 남은 추가 질문을 모두 비우고 진단으로 넘어간다.
  function finishExtra() {
    for (var i = st.extraIdx; i < EXTRA.length; i++) {
      if (st.extra[EXTRA[i].key] === undefined) st.extra[EXTRA[i].key] = '';
    }
    st.extraIdx = EXTRA.length;
    input.placeholder = PLACEHOLDER;
    st.stage = 'idle';
    st.extraDone = true;
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
      if (d.crisis) flagCrisis();
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

  function renderResult(d) {
    st.stage = 'done';
    st.sheet = d.sheet;

    var card = document.createElement('div');
    card.className = 'result-card ' + d.color;
    var label = document.createElement('p');
    label.className = 'result-label';
    label.textContent = '진단 결과 · ' + d.result + (d.rule ? ' (규칙 ' + d.rule + ')' : '') + ' · ' + sourceLabel();
    var title = document.createElement('h2');
    title.textContent = d.title;
    var note = document.createElement('p');
    note.className = 'result-note';
    note.textContent = d.note;
    card.appendChild(label);
    card.appendChild(title);
    card.appendChild(note);

    var h = document.createElement('h3');
    h.textContent = '지금 할 일';
    card.appendChild(h);
    var ol = document.createElement('ol');
    ol.className = 'steps';
    d.steps.forEach(function (s) { var li = document.createElement('li'); li.textContent = s; ol.appendChild(li); });
    card.appendChild(ol);

    var h2 = document.createElement('h3');
    h2.textContent = '맞는 기관';
    card.appendChild(h2);
    var ul = document.createElement('ul');
    ul.className = 'institutions';
    d.institutions.forEach(function (s) { var li = document.createElement('li'); li.textContent = s; ul.appendChild(li); });
    card.appendChild(ul);

    if (d.draft) {
      var h3 = document.createElement('h3');
      h3.textContent = '판매자에게 보낼 요청 메시지 초안';
      card.appendChild(h3);
      var dr = document.createElement('pre');
      dr.className = 'sheet';
      dr.textContent = d.draft;
      card.appendChild(dr);
    }
    (d.notes || []).forEach(function (n) {
      var np = document.createElement('p');
      np.className = 'notes';
      np.textContent = n;
      card.appendChild(np);
    });

    var wide = document.createElement('div');
    wide.className = 'bubble wide';
    wide.appendChild(card);
    row('bot', wide);

    var sheetBox = document.createElement('div');
    sheetBox.className = 'bubble wide';
    var intro = document.createElement('p');
    intro.className = 'bubble-title';
    intro.textContent = '증거 정리표예요. 내용을 확인하고 내려받아 기관에 가져가세요. 제출은 직접 하셔야 해요.';
    var pre = document.createElement('pre');
    pre.className = 'sheet';
    pre.textContent = st.sheet;
    var dl = document.createElement('button');
    dl.type = 'button';
    dl.className = 'btn btn-primary btn-block';
    dl.textContent = '정리표 내려받기 (.txt)';
    dl.addEventListener('click', onDownload);
    sheetBox.appendChild(intro);
    sheetBox.appendChild(pre);
    sheetBox.appendChild(dl);
    row('bot', sheetBox);

    bot(d.disclaimer, 'muted');
    var r = bot('다른 상황도 확인해 보시겠어요? 아래 입력창에 새로 적어 주셔도 돼요.');
    chipsIn(r, [{ label: '처음부터 다시', onPick: restartAll }]);
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
    greet();
  }

  async function onSend(e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || st.busy) return;
    input.value = '';
    // 문장 정리(/api/extract)를 거치지 않는 단계에서도 위기 표현을 먼저 검사한다(기획서: 모든 입력에서 먼저 감지).
    if (st.stage === 'extra') {
      me(text);
      if (hasCrisis(text)) flagCrisis();
      answerExtra(text);
      return;
    }
    if (st.stage === 'ask' || st.stage === 'confirm') {
      me(text);
      if (hasCrisis(text)) {
        flagCrisis();
        bot('안내를 먼저 확인해 주세요. 원하시면 위 선택지를 골라 이어서 진행할 수 있어요.');
        return;
      }
      bot('위 선택지 중에서 골라 주세요. 처음부터 다시 하려면 아래 버튼을 눌러 주세요.');
      return;
    }
    if (st.stage === 'done') {
      // 결과 뒤에 새로 적으면 이전 기록은 두고 새 상황으로 다시 정리한다.
      resetState();
    }
    me(text);
    extract(text);
  }

  async function init() {
    chat = $('chat');
    input = $('input');
    sendBtn = $('send');
    $('composer').addEventListener('submit', onSend);
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
      st.crisisWords = meta.crisisWords || [];
      st.crisisPairs = meta.crisisPairs || [];
      resetState();
      greet();
    } catch (e) {
      bot('화면을 불러오지 못했어요: ' + e.message);
    }
  }

  init();
})();
