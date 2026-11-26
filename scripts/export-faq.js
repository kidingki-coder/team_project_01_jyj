'use strict';

// 자주 묻는 질문과 고정 응답 문구를 사람이 읽는 파일로 뽑는다. 팀이 근거 문서와 대조하고 키워드를 검토할 때 쓴다.
// 실행: node scripts/export-faq.js
// 만드는 파일(docs/):
//   자주묻는질문_목록.txt  질문·답변·키워드·연결·출처, 고정 응답 문구, 결과별 질문 순서, 단어 목록
//   자주묻는질문.csv       질문 한 줄에 한 행인 표
//   고정응답문구.csv       고정 문구 한 줄에 한 행인 표
// 원천은 lib/faq.js, lib/replies.js, lib/intent.js, lib/rules.js 이다. 파일을 직접 고치지 말고 코드를 고친 뒤 다시 만든다.
// docs/답변참고문서 는 서버가 근거로 읽는 폴더라서 여기에는 넣지 않는다.

const fs = require('fs');
const path = require('path');
const { FAQ, FEATURED } = require('../lib/faq');
const { REPLIES, REPLY_INFO } = require('../lib/replies');
const { WORDS } = require('../lib/intent');
const { CRISIS_INFO } = require('../lib/rules');

const OUT = path.join(__dirname, '..', 'docs');
const BOM = '﻿';
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

const NOTE_REVIEW = '※ 팀 검토 필요: 답변과 키워드는 docs/답변참고문서의 근거 문서를 옮긴 것이다. 문서와 대조해 틀린 곳이 없는지, 빠진 질문이 없는지 확인해 주세요.';
const NOTE_LEGAL = '※ 이 안내는 법적 판단이 아니며 사기 여부나 자격을 판정하지 않는다.';
const HOW = '※ 이 파일은 node scripts/export-faq.js 로 만든 것이다. 고칠 때는 lib/faq.js, lib/replies.js 를 고친 뒤 다시 만든다.';

function csvCell(v) {
  return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"';
}

function csv(rows) {
  return BOM + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function actionLine(a) {
  const parts = [a.label];
  if (a.tel) parts.push('☎' + a.tel);
  if (a.url) parts.push(a.url);
  if (a.note) parts.push('(' + a.note + ')');
  return parts.join(' · ');
}

// 같은 목록이 코드와 어긋나지 않았는지 확인한다(빈 칸, 'undefined' 글자가 그대로 나가는 일을 막는다).
function validate() {
  const ids = new Set();
  FAQ.forEach((f, i) => {
    const where = `FAQ ${i + 1} (${f.id})`;
    if (ids.has(f.id)) throw new Error(`${where}: id 가 겹쳐요`);
    ids.add(f.id);
    if (!f.q || !f.answer || !f.answer.length) throw new Error(`${where}: 질문이나 답변이 비었어요`);
    if (!f.sources.length) throw new Error(`${where}: 근거 출처가 없어요`);
    if (f.sources.some((s) => !s || !s.name || !s.url)) throw new Error(`${where}: 근거 출처 이름·주소가 비었어요`);
    if (f.actions.some((a) => !a || !a.label)) throw new Error(`${where}: 연결 정보가 비었어요`);
    if (!f.keywords.length) throw new Error(`${where}: 키워드가 없어요`);
  });
  for (const [result, list] of Object.entries(FEATURED)) {
    list.forEach((id) => { if (!ids.has(id)) throw new Error(`결과별 질문 순서(${result})에 없는 질문 id: ${id}`); });
  }
  REPLY_INFO.forEach((info) => {
    if (REPLIES[info.key] === undefined) throw new Error(`고정 문구 ${info.key} 가 lib/replies.js 에 없어요`);
  });
  Object.keys(REPLIES).forEach((k) => {
    if (!REPLY_INFO.some((i) => i.key === k)) throw new Error(`고정 문구 ${k} 의 설명이 REPLY_INFO 에 없어요`);
  });
}

function replyPhrases(key) {
  const v = REPLIES[key];
  return Array.isArray(v) ? v : [v];
}

function buildTxt() {
  const num = new Map(FAQ.map((f, i) => [f.id, i + 1]));
  const L = [];
  const line = (s = '') => L.push(s);
  const rule = (title) => { line(); line('='.repeat(60)); line(title); line('='.repeat(60)); };

  line('중고거래 피해 대응 길잡이 - 자주 묻는 질문·고정 응답 문구 목록');
  line(`만든 날: ${today}`);
  line(HOW);
  line(NOTE_REVIEW);
  line(NOTE_LEGAL);
  line();
  line('목차');
  line(`  1. 자주 묻는 질문 (${FAQ.length}개)`);
  line('  2. 고정 응답 문구');
  line('  3. 진단 결과별로 먼저 보여 주는 질문');
  line('  4. 부록: 말의 종류를 가르는 단어 목록');

  rule(`1. 자주 묻는 질문 (${FAQ.length}개)`);
  line('이용자가 쓴 질문에 이 단어가 들어 있으면 해당 질문의 답을 보여 준다. 점수는 맞은 단어 글자 수의 합이고, 진단 결과가 있으면 그 결과에 맞는 질문에 1점을 더 준다.');
  FAQ.forEach((f, i) => {
    line();
    line('-'.repeat(60));
    line(`[${i + 1}] ${f.q}`);
    line('-'.repeat(60));
    line('답변:');
    f.answer.forEach((p) => line('  - ' + p));
    if (f.byResult) {
      line('진단 결과에 따라 달라지는 답(이 결과일 때는 위 답변 대신 이 답을 보여 준다):');
      for (const [result, paras] of Object.entries(f.byResult)) {
        line(`  [${result}]`);
        paras.forEach((p) => line('    - ' + p));
      }
    }
    line('먼저 보여 주는 결과: ' + (f.forResults ? f.forResults.join(', ') : '(결과와 상관없이 같은 순서)'));
    line('화면이 이 질문을 찾는 키워드: ' + f.keywords.join(', '));
    line('바로 연결:' + (f.actions.length ? '' : ' (없음)'));
    f.actions.forEach((a) => line('  - ' + actionLine(a)));
    line('근거 출처:');
    f.sources.forEach((s) => { line('  - ' + s.name); line('    ' + s.url); });
  });

  rule('2. 고정 응답 문구');
  line('AI 가 만든 말이 아니라 미리 정해 둔 문구다. 괄호 안 숫자는 여러 문구를 돌려 쓰는 경우의 번호다.');
  REPLY_INFO.forEach((info) => {
    line();
    line(`[${info.kind}]`);
    line('  나오는 때: ' + info.when);
    const phrases = replyPhrases(info.key);
    phrases.forEach((p, i) => line(`  - ${phrases.length > 1 ? `(${i + 1}) ` : ''}${p}`));
  });
  line();
  line('[위기 표현 안내(고정)]');
  line('  나오는 때: 위기 단어(lib/crisis.js)가 감지되면 어느 단계에서나 다른 안내보다 먼저. 화면 위쪽 안내 카드가 붉게 바뀐다.');
  line(`  - ${CRISIS_INFO.title} ${CRISIS_INFO.text}`);

  rule('3. 진단 결과별로 먼저 보여 주는 질문');
  line('결과 화면 아래 질문 버튼의 순서다. 질문 번호는 1번 목록과 같다.');
  for (const [result, ids] of Object.entries(FEATURED)) {
    line();
    line(`[${result === 'DEFAULT' ? '그 밖의 결과' : result}]`);
    ids.forEach((id, i) => line(`  ${i + 1}. (질문 ${num.get(id)}) ${FAQ[num.get(id) - 1].q}`));
  }

  rule('4. 부록: 말의 종류를 가르는 단어 목록');
  line('이용자의 말을 사건 설명·감사·감정·질문·인사로 가르는 기준이다(lib/intent.js). 위에서부터 차례로 보고, 애매하면 사건 설명으로 본다.');
  line('위기 단어는 lib/crisis.js 에 따로 있고 항상 가장 먼저 검사한다.');
  const group = (title, words) => { line(); line(`[${title}]`); line('  ' + words.join(', ')); };
  line();
  line(`[사건 설명으로 보는 기준] ${WORDS.longText}자 이상이거나 아래 표현이 있으면`);
  line('  ' + WORDS.event.join(', '));
  group('감사 표현', WORDS.thanks);
  group('감정 표현', WORDS.feeling);
  group('질문 표현', WORDS.question);
  group('인사', WORDS.hello);

  return BOM + L.join('\r\n') + '\r\n';
}

function buildFaqCsv() {
  const rows = [['번호', '질문', '답변', '결과별 답(결과: 답)', '먼저 보여 주는 결과', '키워드', '바로 연결', '근거 출처 이름', '근거 출처 주소']];
  FAQ.forEach((f, i) => {
    rows.push([
      i + 1,
      f.q,
      f.answer.join('\n'),
      f.byResult ? Object.entries(f.byResult).map(([r, p]) => `[${r}] ` + p.join('\n')).join('\n\n') : '',
      f.forResults ? f.forResults.join(', ') : '',
      f.keywords.join(', '),
      f.actions.map(actionLine).join('\n'),
      f.sources.map((s) => s.name).join('\n'),
      f.sources.map((s) => s.url).join('\n'),
    ]);
  });
  return csv(rows);
}

function buildRepliesCsv() {
  const rows = [['종류', '나오는 때', '문구']];
  REPLY_INFO.forEach((info) => {
    const phrases = replyPhrases(info.key);
    phrases.forEach((p, i) => rows.push([phrases.length > 1 ? `${info.kind} (${i + 1}/${phrases.length})` : info.kind, info.when, p]));
  });
  rows.push(['위기 표현 안내(고정)', '위기 단어가 감지되면 어느 단계에서나 다른 안내보다 먼저', `${CRISIS_INFO.title} ${CRISIS_INFO.text}`]);
  return csv(rows);
}

validate();
const files = {
  '자주묻는질문_목록.txt': buildTxt(),
  '자주묻는질문.csv': buildFaqCsv(),
  '고정응답문구.csv': buildRepliesCsv(),
};
for (const [name, body] of Object.entries(files)) {
  if (/undefined|\[object Object\]/.test(body)) throw new Error(`${name}: 값이 비어 있는 곳이 있어요`);
  fs.writeFileSync(path.join(OUT, name), body, 'utf8');
}
const phraseCount = REPLY_INFO.reduce((n, i) => n + replyPhrases(i.key).length, 0) + 1;
console.log(`만들었어요: docs/ 아래 ${Object.keys(files).join(', ')}`);
console.log(`자주 묻는 질문 ${FAQ.length}개, 고정 응답 문구 ${phraseCount}개`);
