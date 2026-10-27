// Shared, bounded decoder for the WebView export protocol. Text exports stay UTF-8.
export function decodeExportContent(message: {content: string; encoding?: unknown; mime?: unknown}): string | Uint8Array {
  if (message.encoding === undefined) return message.content;
  if (message.encoding !== 'base64' || message.mime !== 'application/pdf') throw new Error('Unsupported binary export encoding.');
  const text = message.content;
  if (!text.length || text.length > 44739244 || text.length % 4) throw new Error('Invalid PDF base64.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const size = text.length / 4 * 3 - padding;if (size > 32 * 1024 * 1024) throw new Error('PDF export is too large.');
  const bytes = new Uint8Array(size);let cursor = 0;
  for (let i = 0; i < text.length; i += 4) {
    const a = alphabet.indexOf(text[i]), b = alphabet.indexOf(text[i + 1]), c = text[i + 2] === '=' ? 0 : alphabet.indexOf(text[i + 2]), d = text[i + 3] === '=' ? 0 : alphabet.indexOf(text[i + 3]);
    const last = i + 4 === text.length;
    if (a < 0 || b < 0 || c < 0 || d < 0 || (!last && (text[i + 2] === '=' || text[i + 3] === '=')) || (text[i + 2] === '=' && text[i + 3] !== '=')) throw new Error('Invalid PDF base64.');
    if (i + 4 === text.length && ((padding === 2 && (b & 15)) || (padding === 1 && (c & 3)))) throw new Error('Non-canonical PDF base64.');
    const value = (a << 18) | (b << 12) | (c << 6) | d;
    if (cursor < size) bytes[cursor++] = value >> 16 & 255;
    if (cursor < size) bytes[cursor++] = value >> 8 & 255;
    if (cursor < size) bytes[cursor++] = value & 255;
  }
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new Error('Invalid PDF header.');
  return bytes;
}
