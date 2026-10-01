import sharp from "sharp";

// SVG hygiene: the model writes the markup and the user's prompt can steer the
// model, so anything that can run script or load external/local files is
// stripped before it reaches librsvg or a browser.
const FORBIDDEN = ["script", "foreignObject", "image", "iframe", "video", "audio", "text", "tspan", "textPath", "use"];

export function sanitizeSvg(raw, { width = 256, height = 256 } = {}) {
  const source = String(raw || "").replace(/```(?:svg|xml)?/gi, "");
  const start = source.search(/<svg\b/i);
  const end = source.toLowerCase().lastIndexOf("</svg>");
  if (start < 0 || end < start) throw new Error("No <svg> element in the reply");
  let svg = source.slice(start, end + 6);
  for (const tag of FORBIDDEN) {
    svg = svg
      .replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "")
      .replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }
  svg = svg
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!ENTITY[\s\S]*?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\s(?:xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    .replace(/url\(\s*(?!['"]?#)[^)]*\)/gi, "none")
    .replace(/@import[^;]*;?/gi, "");
  const rootTag = svg.match(/<svg\b[^>]*>/i)[0];
  const viewBox = rootTag.match(/viewBox\s*=\s*["']([^"']+)["']/i)?.[1] ?? `0 0 ${width} ${height}`;
  const [, , vbW, vbH] = viewBox.trim().split(/[\s,]+/).map(Number);
  if (!(vbW > 0 && vbH > 0)) throw new Error(`Invalid viewBox "${viewBox}"`);
  const keep = [...rootTag.matchAll(/\s(shape-rendering|preserveAspectRatio)\s*=\s*("[^"]*"|'[^']*')/gi)].map((m) => ` ${m[1]}=${m[2]}`).join("");
  const newRoot = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox}" width="${vbW}" height="${vbH}"${keep}>`;
  svg = svg.replace(rootTag, newRoot);
  return { svg, width: vbW, height: vbH };
}

// Rasterize to a PNG whose longest side is `size` px, trimmed of empty margin.
export async function rasterizeSvg({ svg, width, height }, size = 256) {
  const scale = size / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const sized = svg.replace(/<svg\b[^>]*>/i, (tag) => tag.replace(/\swidth="[^"]*"/, ` width="${w}"`).replace(/\sheight="[^"]*"/, ` height="${h}"`));
  const png = await sharp(Buffer.from(sized), { limitInputPixels: 4096 * 4096 }).png().toBuffer();
  const trimmed = await sharp(png).trim({ threshold: 1 }).png().toBuffer().catch(() => png);
  const meta = await sharp(trimmed).metadata();
  return { png: trimmed, width: meta.width, height: meta.height };
}

// Quick checks: is anything drawn, and is it a cut-out sprite or a full
// rectangle painted edge to edge (a background the model was told not to draw)?
export async function inspectSprite(png, { background = false } = {}) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0;
  for (let i = 3; i < data.length; i += info.channels) if (data[i] > 24) opaque += 1;
  const coverage = opaque / (info.width * info.height);
  const alpha = (x, y) => data[(y * info.width + x) * info.channels + 3];
  const corners = [alpha(0, 0), alpha(info.width - 1, 0), alpha(0, info.height - 1), alpha(info.width - 1, info.height - 1)];
  const issues = [];
  if (coverage < 0.03) issues.push("The drawing is empty or almost empty — draw the full object so it fills most of the canvas.");
  if (!background && corners.every((a) => a > 200)) issues.push("The sprite has an opaque rectangular background — remove it so everything outside the object is transparent.");
  return { coverage, issues };
}
