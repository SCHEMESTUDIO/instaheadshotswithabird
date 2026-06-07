// ============================================================
//  Minimal JPG/PNG dimension reader — no dependency.
//  Returns { width, height } or null if it can't parse.
// ============================================================

export function imageDimensions(buf) {
  if (!buf || buf.length < 24) return null;

  // PNG: \x89 P N G ... IHDR has width@16, height@20 (big-endian uint32)
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // JPEG: scan for a Start-Of-Frame marker
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const marker = buf[o + 1];
      // SOF0–SOF15, excluding DHT(C4), JPG(C8), DAC(CC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(o + 5), width: buf.readUInt16BE(o + 7) };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }
      const len = buf.readUInt16BE(o + 2);
      if (len < 2) return null;
      o += 2 + len;
    }
  }
  return null;
}
