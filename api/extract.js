'use strict';

// POST /api/extract  { text } → { crisis, facts, answeredBy, attempts, redaction }
// 위기 단어 감지(목록) + 개인정보 가리기 + AI 사실 정리. 분류는 하지 않는다.
// AI 에는 가린 텍스트만 보낸다. 원본 텍스트는 저장하지 않는다.

const { containsCrisis } = require('../lib/crisis');
const { extractFacts } = require('../lib/ai');
const { redact } = require('../lib/redact');
const { send, parseBody } = require('../lib/http');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST 로만 보낼 수 있어요.' });

  const body = parseBody(req);
  const raw = typeof body.text === 'string' ? body.text.trim().slice(0, 4000) : '';
  if (!raw) return send(res, 400, { error: '문장을 입력해 주세요.' });

  const crisis = containsCrisis(raw);
  const masked = redact(raw);
  const ai = await extractFacts(masked.text);
  return send(res, 200, {
    crisis,
    facts: ai.facts,
    answeredBy: ai.answeredBy,
    attempts: ai.attempts,
    redaction: { counts: masked.counts, total: masked.total, maskedText: masked.text },
  });
};
