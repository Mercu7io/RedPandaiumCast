const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  subtitleGenerateSchema,
  isAllowedCdnUrl,
  jsonToVtt,
  translateVttWithGroq,
  CACHE_DIR,
  CACHE_TTL_MS,
  pruneExpiredSubtitleCache,
  findNativeSubtitle,
  getSmallestVideoUrl,
  getLanguageName,
  parseVtt,
  pinVerifySchema
} = require('../server');
const fs = require('node:fs');
const path = require('node:path');

describe('Backend Server - Schema & Validation Unit Tests', () => {
  test('subtitleGenerateSchema accepts valid parameters', () => {
    const valid = {
      lank: 'pub-jwbm_202401_1_VIDEO',
      targetLang: 'es',
      sourceLang: 'en',
      audioUrl: 'https://b.jw-cdn.org/apis/mediator/audio.mp4'
    };
    const res = subtitleGenerateSchema.safeParse(valid);
    assert.equal(res.success, true);
    assert.equal(res.data.lank, 'pub-jwbm_202401_1_VIDEO');
    assert.equal(res.data.targetLang, 'es');
  });

  test('subtitleGenerateSchema rejects command injection characters in lank', () => {
    const malicious = {
      lank: 'video; rm -rf / ; echo',
      targetLang: 'es'
    };
    const res = subtitleGenerateSchema.safeParse(malicious);
    assert.equal(res.success, false);
    assert.ok(res.error.issues.some(i => i.path.includes('lank')));
  });

  test('subtitleGenerateSchema rejects missing targetLang', () => {
    const invalid = { lank: 'valid-lank' };
    const res = subtitleGenerateSchema.safeParse(invalid);
    assert.equal(res.success, false);
    assert.ok(res.error.issues.some(i => i.path.includes('targetLang')));
  });

  test('isAllowedCdnUrl validates allowed domains and blocks untrusted/internal domains', () => {
    assert.equal(isAllowedCdnUrl('https://b.jw-cdn.org/apis/media/test.mp4'), true);
    assert.equal(isAllowedCdnUrl('https://assets.jw-cdn.org/video.mp4'), true);
    assert.equal(isAllowedCdnUrl('https://sub.jw-cdn.org/audio.mp3'), true);

    // Block SSRF targets
    assert.equal(isAllowedCdnUrl('http://169.254.169.254/latest/meta-data'), false);
    assert.equal(isAllowedCdnUrl('http://localhost:3000/api'), false);
    assert.equal(isAllowedCdnUrl('https://evil.com/fake.mp4'), false);
    assert.equal(isAllowedCdnUrl('ftp://b.jw-cdn.org/test'), false);
    assert.equal(isAllowedCdnUrl('not-a-url'), false);
  });

  test('jsonToVtt accurately converts Whisper segment JSON to standard WEBVTT', () => {
    const mockWhisperJson = {
      segments: [
        {
          start: 1.25,
          end: 4.5,
          text: ' Hello world! '
        },
        {
          start: 5.0,
          end: 8.75,
          text: ' Testing subtitle generation. '
        }
      ]
    };

    const vtt = jsonToVtt(mockWhisperJson);
    assert.ok(vtt.startsWith('WEBVTT\n\n'));
    assert.ok(vtt.includes('00:00:01.250 --> 00:00:04.500'));
    assert.ok(vtt.includes('Hello world!'));
    assert.ok(vtt.includes('00:00:05.000 --> 00:00:08.750'));
    assert.ok(vtt.includes('Testing subtitle generation.'));
  });

  test('jsonToVtt handles empty segments gracefully', () => {
    assert.equal(jsonToVtt({}), 'WEBVTT\n\n');
    assert.equal(jsonToVtt({ segments: [] }), 'WEBVTT\n\n');
  });

  test('translateVttWithGroq throws error if apiKey is missing', async () => {
    await assert.rejects(
      async () => {
        await translateVttWithGroq('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello', 'en', 'fr', '');
      },
      /GROQ_API_KEY is required/
    );
  });

  test('CACHE_DIR is defined and directory exists on disk', () => {
    assert.ok(CACHE_DIR);
    assert.equal(fs.existsSync(CACHE_DIR), true);
  });

  test('CACHE_TTL_MS is strictly set to 1 hour (3600000 ms)', () => {
    assert.equal(CACHE_TTL_MS, 60 * 60 * 1000);
  });

  test('pruneExpiredSubtitleCache removes files older than 1h and preserves recent ones', () => {
    const expiredFile = path.join(CACHE_DIR, 'test_expired_1h.vtt');
    const freshFile = path.join(CACHE_DIR, 'test_fresh_sub.vtt');

    fs.writeFileSync(expiredFile, 'WEBVTT\n\nexpired');
    fs.writeFileSync(freshFile, 'WEBVTT\n\nfresh');

    // Artificially age the expired file to 2 hours ago
    const twoHoursAgo = (Date.now() - (2 * 60 * 60 * 1000)) / 1000;
    fs.utimesSync(expiredFile, twoHoursAgo, twoHoursAgo);

    pruneExpiredSubtitleCache();

    assert.equal(fs.existsSync(expiredFile), false, 'Expired file (>1h) should have been pruned');
    assert.equal(fs.existsSync(freshFile), true, 'Fresh file (<1h) should remain in cache');

    // Cleanup
    try { fs.unlinkSync(freshFile); } catch (_) {}
  });

  test('getLanguageName resolves common codes and custom codes like Tagalog', () => {
    assert.equal(getLanguageName('tl'), 'Tagalog');
    assert.equal(getLanguageName('fr'), 'French');
    assert.equal(getLanguageName('es'), 'Spanish');
    assert.equal(getLanguageName('nl'), 'Dutch');
    assert.equal(getLanguageName('en'), 'English');
    assert.equal(getLanguageName('de'), 'German');
  });

  test('findNativeSubtitle returns null gracefully for invalid lank', async () => {
    const res = await findNativeSubtitle('non_existent_lank_123456789', 'en');
    assert.equal(res, null);
  });

  test('getSmallestVideoUrl returns null gracefully for invalid lank', async () => {
    const res = await getSmallestVideoUrl('non_existent_lank_123456789');
    assert.equal(res, null);
  });

  test('parseVtt cleanly parses standard WebVTT blocks without altering timestamps', () => {
    const sampleVtt = `WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000 align:center\nFirst line\nSecond line\n\n00:00:04.000 --> 00:00:06.000\nThird line`;
    const { header, parsedCues } = parseVtt(sampleVtt);
    assert.equal(header, 'WEBVTT');
    assert.equal(parsedCues.length, 2);
    assert.equal(parsedCues[0].id, '1');
    assert.equal(parsedCues[0].timestamp, '00:00:01.000 --> 00:00:03.000 align:center');
    assert.equal(parsedCues[0].text, 'First line\nSecond line');
    assert.equal(parsedCues[1].id, '');
    assert.equal(parsedCues[1].timestamp, '00:00:04.000 --> 00:00:06.000');
    assert.equal(parsedCues[1].text, 'Third line');
  });

  test('pinVerifySchema validates correct PIN formats and rejects empty or invalid inputs', () => {
    const valid = pinVerifySchema.safeParse({ pin: '1234' });
    assert.equal(valid.success, true);
    assert.equal(valid.data.pin, '1234');

    const empty = pinVerifySchema.safeParse({ pin: '' });
    assert.equal(empty.success, false);

    const missing = pinVerifySchema.safeParse({});
    assert.equal(missing.success, false);

    const tooLong = pinVerifySchema.safeParse({ pin: 'a'.repeat(33) });
    assert.equal(tooLong.success, false);
  });
});
