// The reply for an error that reached the app's last error handler: { status, error }, or null
// for a server fault (logged, then answered with 500 "Server error").
// Errors made by the request (a JSON body that can't be parsed or is too large, a missing
// built file, an upload over the cap) get their own 4xx status and a short message, and aren't
// logged: anyone can send them, signed in or not.
const CLIENT_MESSAGES = { 404: 'Not found', 413: 'Request is too large', 415: 'Unsupported request format' };

export function errorReply(err) {
  if (!err || typeof err !== 'object') return null;
  if (err.code === 'LIMIT_FILE_SIZE') return { status: 413, error: 'File is too large (max 50 MB)' };
  if (err.name === 'MulterError') return { status: 400, error: err.message };
  const status = Number(err.status ?? err.statusCode);
  if (!Number.isInteger(status) || status < 400 || status > 499) return null;
  // body-parser errors carry a `type` ('entity.parse.failed', 'entity.too.large', ...) and the
  // parser's own wording, which isn't for users; other 4xx errors meant for users keep theirs.
  const own = err.expose && !err.type && status !== 404 && typeof err.message === 'string' && err.message.trim();
  return { status, error: own ? err.message : CLIENT_MESSAGES[status] || 'Bad request' };
}
