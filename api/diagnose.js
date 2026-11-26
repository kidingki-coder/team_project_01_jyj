'use strict';

// GET  /api/diagnose             → { questions, platforms, crisisInfo, crisisWords, crisisPairs, intentWords, faq, faqFeatured, replies }  (화면이 쓰는 목록)
// POST /api/diagnose { facts, extra, crisis, platform, done } → 규칙표 결과 · 안내 · 연결 · 증거 정리표
// AI 를 쓰지 않는다. 분류는 lib/rules.js 의 규칙표가 한다.

const { QUESTIONS, CRISIS_INFO, PLATFORMS, diagnose } = require('../lib/rules');
const { WORDS, PAIRS } = require('../lib/crisis');
const { WORDS: INTENT_WORDS } = require('../lib/intent');
const { FAQ, FEATURED } = require('../lib/faq');
const { REPLIES } = require('../lib/replies');
const { send, parseBody } = require('../lib/http');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return send(res, 200, {
      questions: QUESTIONS,
      platforms: PLATFORMS,
      crisisInfo: CRISIS_INFO,
      crisisWords: WORDS,
      crisisPairs: PAIRS,
      intentWords: INTENT_WORDS,
      faq: FAQ,
      faqFeatured: FEATURED,
      replies: REPLIES,
    });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'GET 또는 POST 로 보내 주세요.' });

  const body = parseBody(req);
  const result = diagnose(body.facts, body.extra, body.crisis === true, { platform: body.platform, done: body.done });
  return send(res, 200, result);
};
