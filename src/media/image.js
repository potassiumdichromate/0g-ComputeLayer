import sharp from "sharp";

// Image-model sprites come on a flat background. Key out the color found on the
// border (flood from the edges so interior pixels of the same color survive),
// then trim and fit into a square transparent canvas.
export async function cutOutSprite(buffer, { size = 256, tolerance = 60 } = {}) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const at = (x, y) => (y * w + x) * c;
  const samples = [];
  for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 32))) samples.push(at(x, 0), at(x, h - 1));
  for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 32))) samples.push(at(0, y), at(w - 1, y));
  const avg = [0, 1, 2].map((k) => samples.reduce((s, i) => s + data[i + k], 0) / samples.length);
  const close = (i) => Math.abs(data[i] - avg[0]) + Math.abs(data[i + 1] - avg[1]) + Math.abs(data[i + 2] - avg[2]) < tolerance;

  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x += 1) stack.push(x, 0, x, h - 1);
  for (let y = 0; y < h; y += 1) stack.push(0, y, w - 1, y);
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * c;
    if (!close(i)) continue;
    data[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  const keyed = await sharp(data, { raw: { width: w, height: h, channels: c } }).png().toBuffer();
  const trimmed = await sharp(keyed).trim({ threshold: 10 }).png().toBuffer().catch(() => keyed);
  return sharp(trimmed).resize(size, size, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

export async function normalizeBackground(buffer, { width = 720, height = 1280 } = {}) {
  return sharp(buffer).resize(width, height, { fit: "cover", position: "centre" }).jpeg({ quality: 84 }).toBuffer();
}

export async function normalizeCover(buffer, { width = 768, height = 1152 } = {}) {
  return sharp(buffer).resize(width, height, { fit: "cover", position: "centre" }).webp({ quality: 86 }).toBuffer();
}

// Deterministic cover when no image model is available: palette gradient,
// big title, and the player sprite if one exists.
export async function fallbackCover({ title, palette, playerPng = null, width = 768, height = 1152 }) {
  const safe = String(title || "Game").replace(/[<>&"']/g, "").toUpperCase().slice(0, 28);
  const words = safe.split(/\s+/);
  const lines = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last && (last + " " + word).length <= 12) lines[lines.length - 1] = last + " " + word; else lines.push(word);
  }
  const fontSize = lines.some((l) => l.length > 9) ? 86 : 104;
  const textSvg = lines.slice(0, 3).map((line, i) =>
    `<text x="${width / 2}" y="${190 + i * (fontSize + 12)}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${fontSize}" fill="${palette.primary}" stroke="#15122b" stroke-width="10" paint-order="stroke">${line}</text>`
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${palette.bg1}"/><stop offset="1" stop-color="${palette.bg2}"/></linearGradient>
    <radialGradient id="r" cx="0.5" cy="0.62" r="0.5"><stop offset="0" stop-color="${palette.secondary}" stop-opacity="0.55"/><stop offset="1" stop-color="${palette.secondary}" stop-opacity="0"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/><circle cx="${width / 2}" cy="${height * 0.62}" r="${width * 0.48}" fill="url(#r)"/>
    ${textSvg}</svg>`;
  let image = sharp(Buffer.from(svg));
  if (playerPng) {
    const sprite = await sharp(playerPng).resize(Math.round(width * 0.56), Math.round(width * 0.56), { fit: "inside" }).png().toBuffer();
    const meta = await sharp(sprite).metadata();
    image = sharp(await image.png().toBuffer()).composite([{ input: sprite, left: Math.round((width - meta.width) / 2), top: Math.round(height * 0.62 - meta.height / 2) }]);
  }
  return image.webp({ quality: 88 }).toBuffer();
}
