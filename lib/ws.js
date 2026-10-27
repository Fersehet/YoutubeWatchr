// Just enough of a WebSocket server (RFC 6455) for the extension to stream the
// music to us: text messages in, short text replies out. Keeps server.js free of dependencies.
const crypto = require('crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 1 << 16;

/** Finishes the handshake and returns a tiny socket wrapper with onmessage/onclose, send() and close(). */
function accept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);

  const ws = { onmessage: null, onclose: null, open: true, send, close };
  let buf = Buffer.alloc(0), parts = [];

  function frame(op, payload) {
    const len = payload.length;
    const head = len < 126 ? Buffer.from([0x80 | op, len])
      : len < 65536 ? Buffer.from([0x80 | op, 126, len >> 8, len & 255])
      : null;
    if (!head) return;
    socket.write(Buffer.concat([head, payload]));
  }
  function send(text) { if (ws.open) frame(1, Buffer.from(text)); }
  function close(code = 1000) {
    if (!ws.open) return;
    ws.open = false;
    frame(8, Buffer.from([code >> 8, code & 255]));
    socket.end();
    ws.onclose?.();
  }

  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) return close(1009);
      if (!masked || len > MAX_MESSAGE) return close(1002); // clients must mask
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4);
      const data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);

      if (op === 8) return close();
      if (op === 9) { frame(10, data); continue; } // ping → pong
      if (op === 10) continue;
      parts.push(data);
      if (parts.reduce((n, p) => n + p.length, 0) > MAX_MESSAGE) return close(1009);
      if (fin) {
        const text = Buffer.concat(parts).toString('utf8');
        parts = [];
        ws.onmessage?.(text);
      }
    }
  });
  const gone = () => { if (ws.open) { ws.open = false; ws.onclose?.(); } };
  socket.on('close', gone);
  socket.on('error', gone);
  return ws;
}

module.exports = { accept };
