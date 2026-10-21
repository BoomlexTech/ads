import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import express from 'express';
import { errorReply } from './errors.js';

// A JSON body run through the same parser the server uses; resolves with its error (if any).
function parse(body, limit = '50kb') {
  return new Promise((resolve) => {
    const req = Readable.from([Buffer.from(body)]);
    req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) };
    req.method = 'POST';
    req.url = '/api/feedback';
    express.json({ limit })(req, {}, (err) => resolve(err));
  });
}

test('broken JSON is a 400 with a short message, not a server error', async () => {
  const err = await parse('{"text": "hi"');
  assert.equal(err?.type, 'entity.parse.failed');
  assert.deepEqual(errorReply(err), { status: 400, error: 'Bad request' });
});

test('a body over the size cap is a 413', async () => {
  const err = await parse(JSON.stringify({ text: 'x'.repeat(60 * 1024) }));
  assert.equal(err?.type, 'entity.too.large');
  assert.deepEqual(errorReply(err), { status: 413, error: 'Request is too large' });
});

test('a valid body has no error', async () => {
  assert.equal(await parse('{"text":"hi"}'), undefined);
});

test('a missing built file (serve-static) is a 404', () => {
  const err = Object.assign(new Error('ENOENT: no such file or directory, stat \'/app/dist/assets/x.js\''), { status: 404, statusCode: 404, expose: false });
  assert.deepEqual(errorReply(err), { status: 404, error: 'Not found' });
});

test('upload errors keep their replies', () => {
  assert.deepEqual(errorReply({ code: 'LIMIT_FILE_SIZE', name: 'MulterError', message: 'File too large' }), { status: 413, error: 'File is too large (max 50 MB)' });
  assert.deepEqual(errorReply({ code: 'LIMIT_UNEXPECTED_FILE', name: 'MulterError', message: 'Unexpected field' }), { status: 400, error: 'Unexpected field' });
});

test('a 4xx error written for users keeps its message', () => {
  const err = Object.assign(new Error('Choose a file'), { status: 400, expose: true });
  assert.deepEqual(errorReply(err), { status: 400, error: 'Choose a file' });
});

test('anything else is a server fault (logged, 500)', () => {
  assert.equal(errorReply(new Error('boom')), null);
  assert.equal(errorReply(Object.assign(new Error('db down'), { status: 503 })), null);
  assert.equal(errorReply(Object.assign(new Error('stream encoding should not be set'), { status: 500, type: 'stream.encoding.set' })), null);
  assert.equal(errorReply(null), null);
  assert.equal(errorReply('text'), null);
});
