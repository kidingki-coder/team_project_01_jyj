'use strict';

// 자유 입력 문장을 사실 항목(허용 값 목록)으로 바꾸는 AI 호출.
// 순서: CLAUDE_API_KEY → GROQ_API_KEY → GEMINI_API_KEY. 앞이 실패하면 다음으로 넘어가고,
// 어느 AI 가 답했는지(또는 왜 모두 실패했는지)를 돌려준다. 판단(사기·분쟁)은 AI가 하지 않는다.

const { FACT_KEYS, VALUES, normalizeFacts } = require('./rules');

// 한 번 호출의 최대 대기 시간과, 키·AI 를 모두 합친 전체 대기 시간.
// 전체 시간은 vercel.json 의 maxDuration(60초)보다 넉넉히 짧게 둔다.
const TIMEOUT_MS = 12000;
const TOTAL_MS = 25000;
const MIN_LEFT_MS = 3000; // 남은 시간이 이보다 적으면 다음 호출을 시작하지 않는다

// 모델 이름은 키로 모델 목록을 조회해 확인했다(2026-11-19). 404 가 나면 여기부터 확인한다.
const MODELS = {
  claude: 'claude-haiku-5-5',
  groq: 'openai/gpt-oss-120b',
  gemini: 'gemini-2.5-flash',
};

const SYSTEM = [
  '너는 중고거래 피해 상담 도구의 사실 정리 도우미다.',
  '사기인지 분쟁인지 판단하거나 법적 결론을 말하지 마라.',
  '사용자가 쓴 문장에서 아래 항목의 값만 골라라.',
  '값은 허용된 목록의 글자 그대로 고른다. 목록에 없거나 확실하지 않으면 "모름"을 고른다. 추측하지 마라.',
  '응답은 JSON 객체 하나만 출력한다. 다른 설명은 쓰지 마라.',
  '항목과 허용 값:',
  ...FACT_KEYS.map((k) => `- ${k}: ${VALUES[k].map((v) => `"${v}"`).join(', ')}`),
].join('\n');

class CallError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

function reasonForStatus(status) {
  if (status === 401 || status === 403) return '승인 안 됨';
  if (status === 404) return '모델 이름 확인 필요(404)';
  if (status === 429) return '사용량 초과(429)';
  return `호출 오류(HTTP ${status})`;
}

async function post(url, headers, body, timeoutMs) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new CallError('시간 초과');
    throw new CallError('네트워크 오류');
  }
  if (!res.ok) throw new CallError(reasonForStatus(res.status));
  return res.json();
}

async function callClaude(key, text, timeoutMs) {
  const j = await post(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    {
      model: MODELS.claude,
      // 모델이 내부 추론에 토큰을 먼저 쓰므로 여유를 둔다(400 이면 본문 없이 끝나는 경우가 있었다).
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: text }],
    },
    timeoutMs,
  );
  return (j.content || []).map((p) => p.text || '').join('');
}

async function callGroq(key, text, timeoutMs) {
  const j = await post(
    'https://api.groq.com/openai/v1/chat/completions',
    { authorization: `Bearer ${key}` },
    {
      model: MODELS.groq,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: text },
      ],
    },
    timeoutMs,
  );
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}

async function callGemini(key, text, timeoutMs) {
  const j = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent`,
    { 'x-goog-api-key': key },
    {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    },
    timeoutMs,
  );
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  return parts.map((p) => p.text || '').join('');
}

const PROVIDERS = [
  { name: 'CLAUDE', envKey: 'CLAUDE_API_KEY', call: callClaude },
  { name: 'GROQ', envKey: 'GROQ_API_KEY', call: callGroq },
  { name: 'GEMINI', envKey: 'GEMINI_API_KEY', call: callGemini },
];

function parseFacts(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

// 키 값은 쉼표로 여러 개 넣을 수 있다. 앞 키가 실패하면 같은 AI 의 다음 키로, 그래도 안 되면 다음 AI 로 넘어간다.
function splitKeys(value) {
  return String(value || '').split(',').map((k) => k.trim()).filter(Boolean);
}

// 반환: { facts, answeredBy, attempts[] }. 모두 실패하면 facts 는 null.
async function extractFacts(text) {
  const attempts = [];
  const started = Date.now();
  for (const p of PROVIDERS) {
    const keys = splitKeys(process.env[p.envKey]);
    if (!keys.length) {
      attempts.push({ name: p.name, ok: false, reason: '키 비어 있음' });
      continue;
    }
    for (let i = 0; i < keys.length; i++) {
      const label = keys.length > 1 ? `${p.name}#${i + 1}` : p.name;
      const left = TOTAL_MS - (Date.now() - started);
      if (left < MIN_LEFT_MS) {
        attempts.push({ name: label, ok: false, reason: '시간 초과(전체 25초 제한)' });
        continue;
      }
      try {
        const raw = await p.call(keys[i], text, Math.min(TIMEOUT_MS, left));
        const parsed = parseFacts(raw);
        if (!parsed) {
          attempts.push({ name: label, ok: false, reason: '응답 형식 오류(JSON 아님)' });
          continue;
        }
        attempts.push({ name: label, ok: true, reason: null });
        return { facts: normalizeFacts(parsed), answeredBy: label, attempts };
      } catch (e) {
        attempts.push({ name: label, ok: false, reason: e instanceof CallError ? e.reason : '알 수 없는 오류' });
      }
    }
  }
  return { facts: null, answeredBy: null, attempts };
}

module.exports = { extractFacts, MODELS };
