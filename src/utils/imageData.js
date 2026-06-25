function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const trimmed = dataUrl.trim();
  if (!trimmed.startsWith('data:')) return null;

  const match = trimmed.match(/^data:image\/([\w+.-]+);base64,(.+)$/i);
  if (!match) return null;

  return {
    format: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
}

module.exports = { parseDataUrl };
