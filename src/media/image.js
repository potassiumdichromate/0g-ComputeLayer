import sharp from "sharp";

// ------------------------------------------------------------------ sprites
// Image-model sprites are generated on a flat chroma-key background (magenta,
// or green when the sprite itself is pink/purple). Keying works on HUE, not
// exact color, so the model's darker same-hue ground shadow goes too. Only
// key-hued regions connected to the image border are removed, so the
// character's outline protects its interior. Edges get a soft matte and the
// key color is un-mixed from them (no magenta fringe); stray specks are dropped.

export const KEY_COLORS = {
  magenta: { name: "magenta", hex: "#ff00ff", rgb: [255, 0, 255] },
  green: { name: "green", hex: "#00ff00", rgb: [0, 255, 0] }
};

// Magenta unless the sprite is likely to contain pink/purple/magenta itself.
export function chooseKey(description = "") {
  return /\b(pink|magenta|purple|violet|fuchsia|lilac|lavender|rose|orchid)\b/i.test(String(description)) ? KEY_COLORS.green : KEY_COLORS.magenta;
}

const chroma = (r, g, b) => [-0.169 * r - 0.331 * g + 0.5 * b, 0.5 * r - 0.419 * g - 0.081 * b];

export async function cutOutSprite(buffer, { size = 320, key = null } = {}) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;

  // Key color: the median of the border, so a stray object at the edge can't skew it.
  const border = [];
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
  for (let x = 0; x < w; x += step) border.push((x) * 4, ((h - 1) * w + x) * 4);
  for (let y = 0; y < h; y += step) border.push((y * w) * 4, (y * w + w - 1) * 4);
  const median = (k) => border.map((i) => data[i + k]).sort((a, b) => a - b)[border.length >> 1];
  const keyRgb = key ? key.rgb : [median(0), median(1), median(2)];
  const [kcb, kcr] = chroma(...keyRgb);
  const kAng = Math.atan2(kcr, kcb);
  const kSat = Math.hypot(kcb, kcr);

  // Keyness 0..1 per pixel: hue close to the key's hue and reasonably saturated.
  const keyness = new Float32Array(n);
  for (let p = 0; p < n; p += 1) {
    const i = p * 4;
    const [cb, cr] = chroma(data[i], data[i + 1], data[i + 2]);
    const sat = Math.hypot(cb, cr);
    if (sat < kSat * 0.12) continue;
    let d = Math.abs(Math.atan2(cr, cb) - kAng);
    if (d > Math.PI) d = 2 * Math.PI - d;
    const hue = d < 0.35 ? 1 : d < 0.6 ? 1 - (d - 0.35) / 0.25 : 0;
    const satW = sat >= kSat * 0.3 ? 1 : (sat - kSat * 0.12) / (kSat * 0.18);
    keyness[p] = hue * satW;
  }

  // Background = key-like pixels connected to the border.
  const bg = new Uint8Array(n);
  const stack = [];
  const seed = (p) => { if (!bg[p] && keyness[p] > 0.5) { bg[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x += 1) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y += 1) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p / w) | 0;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (y > 0) seed(p - w);
    if (y < h - 1) seed(p + w);
  }

  // Alpha: background → 0; pixels touching the background get a soft matte with
  // the key color un-mixed out of them.
  for (let p = 0; p < n; p += 1) {
    const i = p * 4;
    if (bg[p]) { data[i + 3] = 0; continue; }
    const x = p % w, y = (p / w) | 0;
    let edge = false;
    for (let dy = -2; dy <= 2 && !edge; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && bg[yy * w + xx]) { edge = true; break; }
      }
    }
    if (!edge || keyness[p] <= 0.05) continue;
    const a = Math.max(0.05, 1 - keyness[p]);
    for (let k = 0; k < 3; k += 1) data[i + k] = Math.max(0, Math.min(255, Math.round((data[i + k] - (1 - a) * keyRgb[k]) / a)));
    data[i + 3] = Math.round(255 * a);
  }

  // Drop specks: keep opaque components at least 1.5% the size of the largest.
  const label = new Int32Array(n).fill(-1);
  const sizes = [];
  for (let p = 0; p < n; p += 1) {
    if (label[p] !== -1 || data[p * 4 + 3] < 32) continue;
    const id = sizes.length;
    let count = 0;
    label[p] = id;
    stack.push(p);
    while (stack.length) {
      const q = stack.pop();
      count += 1;
      const x = q % w, y = (q / w) | 0;
      const nb = [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1];
      for (const r of nb) if (r >= 0 && label[r] === -1 && data[r * 4 + 3] >= 32) { label[r] = id; stack.push(r); }
    }
    sizes.push(count);
  }
  const largest = Math.max(0, ...sizes);
  for (let p = 0; p < n; p += 1) {
    const id = label[p];
    if (id >= 0 && sizes[id] < largest * 0.015) data[p * 4 + 3] = 0;
    else if (id === -1 && data[p * 4 + 3] < 32) data[p * 4 + 3] = 0;
  }

  const keyed = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const trimmed = await sharp(keyed).trim({ threshold: 1 }).png().toBuffer().catch(() => keyed);
  return sharp(trimmed).resize(size, size, { fit: "inside", withoutEnlargement: false, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
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
