// Стенд сравнения центрального участка: hairpin (текущий) против завитка
// (топология референса). Рисует SVG: полная ячейка, крупный план центра и
// профиль межканального расстояния по углу.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('.', import.meta.url));

const D2R = Math.PI / 180;
const OUT = OUT_DIR + '../docs/generated/stand-centers.svg';

// ---------- общие параметры эталонного пресета ----------
const A_line = 0.096, aEff = 8000;
const R_out = 10.1886, r_min = 5.98, g = 1.2;
const n = 1.75, th0 = 211.34 * D2R;
const chord = 1.2, maxTurnDeg = 5;

function smoothstep(u) { return u * u * (3 - 2 * u); }

// ---------- вариант A: hairpin (как в генераторе сейчас) ----------
function hairpinCell() {
  const pts = [];
  const total = 2 * Math.PI * n;
  const steps = Math.max(24, Math.ceil(total / (maxTurnDeg * D2R)));
  const tSteps = Math.max(24, Math.ceil(Math.PI / (3 * D2R)));
  const dTh = total / steps;
  let r = R_out, th = th0;
  for (let i = 0; i <= steps; i++) {
    pts.push({ x: r * Math.cos(th), y: r * Math.sin(th), seg: 'A' });
    r -= (R_out - r_min) / steps; th += dTh;
  }
  const thEnd = th;
  const turnR = g / 2;
  const cX = (r_min - turnR) * Math.cos(thEnd), cY = (r_min - turnR) * Math.sin(thEnd);
  for (let i = 1; i <= tSteps; i++) {
    const phi = Math.PI * i / tSteps;
    pts.push({
      x: cX + turnR * (Math.cos(phi) * Math.cos(thEnd) - Math.sin(phi) * Math.sin(thEnd)),
      y: cY + turnR * (Math.cos(phi) * Math.sin(thEnd) + Math.sin(phi) * Math.cos(thEnd)), seg: 'T'
    });
  }
  const rB = r_min - g;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    pts.push({
      x: (rB + (R_out - g - rB) * u) * Math.cos(thEnd - total * u),
      y: (rB + (R_out - g - rB) * u) * Math.sin(thEnd - total * u), seg: 'B'
    });
  }
  for (let i = 1; i <= 30; i++) {
    const u = i / 30;
    const r = (R_out - g) + g * u, th = th0 - Math.PI * u;
    pts.push({ x: r * Math.cos(th), y: r * Math.sin(th), seg: 'C' });
  }
  return pts;
}

// ---------- вариант B: завиток (топология референса) ----------
// Ветвь A: спираль внутрь (ccw), шаг равномерный, у центра шаг плавно
// гаснет до нуля (чтобы войти в завиток по касательной).
// Завиток: дуга радиуса Rt вокруг точки, смещённой от оси по радиальной
// линии входа; охват 180° — это и есть разворот направления.
// Ветвь B: спираль наружу (cw); её радиус выводится из общего профиля
// межканального расстояния off(φ) = g + (2Rt - g)·w(φ), так что каналы
// плавно расширяются к центру и не пересекаются.
function curlCell(Rt = 0, betaDeg = 180) {
  const pts = [];
  const q = g, qPerRad = q / (2 * Math.PI);
  const taper = 0.6;                                  // доля оборота на гашение шага
  const nA = Math.max(0.7, n - 0.5);
  const dTh = Math.min(maxTurnDeg * D2R, chord / ((R_out + r_min) / 2));

  // --- ветвь A ---
  const nTaper = Math.round(taper * 2 * Math.PI / dTh);
  const nUniform = Math.max(4, Math.round((2 * Math.PI * nA - taper * 2 * Math.PI) / dTh));
  let r = R_out, th = th0;
  for (let i = 0; i < nUniform; i++) { th += dTh; r -= qPerRad * dTh; pts.push({ x: r * Math.cos(th), y: r * Math.sin(th), seg: 'A' }); }
  for (let i = 1; i <= nTaper; i++) {
    const u = i / nTaper; th += dTh; r -= qPerRad * dTh * (1 - smoothstep(u));
    pts.push({ x: r * Math.cos(th), y: r * Math.sin(th), seg: 'A' });
  }
  const rA = r, thA = th;

  // --- S-переход через центр ---
  // Петля идёт по окружности радиуса rLoop (внутренний виток минус g, чтобы
  // не слипнуться с ним) и по той же окружности выходит на противоположную
  // сторону ячейки через 1.5 оборота (540°). Направление касательной при
  // этом НЕ разворачивается: петля просто продолжает спираль. Стык с ветвью
  // A — G1 (касательные совпадают, кривизна скачком).
  const beta = 3 * Math.PI;
  const rLoop = Math.max(g, rA - g);
  const uX = Math.cos(thA), uY = Math.sin(thA), wX = -uY, wY = uX;
  const nCurl = Math.max(36, Math.ceil(beta / (3 * D2R)));
  for (let i = 1; i <= nCurl; i++) {
    const phi = beta * i / nCurl;
    const cs = Math.cos(phi), sn = Math.sin(phi);
    pts.push({ x: rLoop * (cs * uX + sn * wX), y: rLoop * (cs * uY + sn * wY), seg: 'T' });
  }
  // Выход петли: та же окружность, угол +540° = +180° от входа.
  const thExit = thA + Math.PI;
  const rExit = rLoop;

  // --- ветвь B: спираль наружу в том же направлении, что и ветвь A ---
  // Выход петли и вход ветви B лежат на одной окружности (радиус rA), поэтому
  // касательная стыкуется без разворота. Дальше ветвь расходится наружу,
  // зазор между ветвями плавно сходится к шагу g.
  const nB = Math.max(0.7, nA);
  const spanB = 2 * Math.PI * nB;
  const rAtOut = R_out - g;
  const nBsteps = Math.max(24, Math.ceil(spanB / dTh));
  for (let i = 1; i <= nBsteps; i++) {
    const u = i / nBsteps;
    const th = thExit + spanB * u;
    const r = rExit + (rAtOut - rExit) * u;
    pts.push({ x: r * Math.cos(th), y: r * Math.sin(th), seg: 'B' });
  }
  const thBend = thExit + spanB;
  // --- замыкающая дуга: от (R_out-g, thBend) до (R_out, th0) ---
  let dClose = (th0 - thBend);
  dClose = ((dClose % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const nClose = Math.max(24, Math.ceil(dClose / (maxTurnDeg * D2R)));
  for (let i = 1; i <= nClose; i++) {
    const u = i / nClose;
    const r = rAtOut + g * u, th = thBend + dClose * u;
    pts.push({ x: r * Math.cos(th), y: r * Math.sin(th), seg: 'C' });
  }
  return pts;
}

// ---------- метрики ----------
function metrics(pts) {
  const MINSEG = 0.01;               // вырожденные (совпавшие) точки не измеряем
  let Rmin = Infinity, at = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y);
    if (ab < MINSEG || bc < MINSEG || ca < MINSEG) continue;
    const s = (ab + bc + ca) / 2;
    const area = Math.sqrt(Math.max(0, s * (s - ab) * (s - bc) * (s - ca)));
    if (area < 1e-9) continue;
    const R = ab * bc * ca / (4 * area);
    if (R < Rmin) { Rmin = R; at = i; }
  }
  let maxTurn = 0, turnAt = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const v1 = [pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y];
    const v2 = [pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y];
    const n1 = Math.hypot(...v1), n2 = Math.hypot(...v2);
    if (n1 < MINSEG || n2 < MINSEG) continue;
    const cosv = Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)));
    const deg = Math.acos(cosv) / D2R;
    if (deg > maxTurn) { maxTurn = deg; turnAt = i; }
  }
  // минимальный зазор между дорожками (точка → отрезок), без участка завитка
  const cs = 0.48, grid = new Map();
  for (let i = 0; i < pts.length; i++) {
    const k = Math.floor(pts[i].x / cs) + ',' + Math.floor(pts[i].y / cs);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const dSeg = (p, a, b) => {
    const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy;
    if (L2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2; t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
  };
  let minGap = Infinity;
  for (const bucket of grid.values()) {
    for (const i of bucket) {
      const ix = Math.floor(pts[i].x / cs), iy = Math.floor(pts[i].y / cs);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const other = grid.get((ix + dx) + ',' + (iy + dy));
        if (!other) continue;
        for (const j of other) {
          if (j <= i + 3 || j === 0 || i === 0) continue;
          if (pts[i].seg === 'T' || pts[j].seg === 'T') continue;
          if (pts[i - 1] && pts[j - 1] && (pts[i - 1].seg === 'T' || pts[j - 1].seg === 'T')) continue;
          const dd = Math.min(dSeg(pts[i], pts[j - 1], pts[j]), dSeg(pts[j], pts[i - 1], pts[i]));
          if (dd < minGap) minGap = dd;
        }
      }
    }
  }
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { Rmin, maxTurn, minGap, len };
}

// ---------- профиль канала (зазор между ветвями) ----------
function channelProfile(pts) {
  const A = pts.filter(p => p.seg === 'A'), B = pts.filter(p => p.seg === 'B');
  const out = [];
  for (const b of B) {
    const th = Math.atan2(b.y, b.x);
    let best = null, bestD = Infinity;
    for (const a of A) {
      let d = Math.abs(Math.atan2(a.y, a.x) - th) % (2 * Math.PI);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d < bestD) { bestD = d; best = a; }
    }
    if (best) out.push({ r: Math.hypot(b.x, b.y), gap: Math.hypot(best.x, b.x) - Math.hypot(b.y, best.y) });
  }
  out.sort((a, b) => a.r - b.r);
  return out;
}

// ---------- отрисовка ----------
const variants = [
  { key: 'A', title: 'Текущий: hairpin R = g/2 = 0.6 мм', pts: hairpinCell(), color: '#4d8dff' },
  { key: 'B', title: 'Новое: завиток с центром на оси ячейки (R = R_внутренний)', pts: curlCell(0, 180), color: '#33c6bd' },
];

let svg = '';
svg += `<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="1000" viewBox="0 0 1180 1000" font-family="monospace">`;
svg += `<rect width="1180" height="1000" fill="#0e1218"/>`;

const panel = (px, py, pw, ph, pts, color, title, m, zoom) => {
  const shown = zoom ? pts.filter(p => Math.hypot(p.x, p.y) <= zoom) : pts;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of shown) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  if (!isFinite(minX)) { minX = maxX = minY = maxY = 0; }
  const s = Math.min(pw / (maxX - minX || 1), ph / (maxY - minY || 1)) * 0.9;
  const ox = px + pw / 2 - ((minX + maxX) / 2) * s;
  const oy = py + ph / 2 + ((minY + maxY) / 2) * s;
  const X = (x) => ox + x * s, Y = (y) => oy - y * s;
  let g = `<g>`;
  g += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="#121821" stroke="#26303d"/>`;
  g += `<circle cx="${X(0)}" cy="${Y(0)}" r="${R_out * s}" fill="none" stroke="#2c3a4a" stroke-dasharray="4 4"/>`;
  const colors = { A: color, T: '#f2a03c', B: '#ee5c4e', C: '#8bd86f' };
  let cur = null, d = '';
  for (const p of shown) {
    if (cur !== p.seg) {
      if (d) g += `<path d="${d}" fill="none" stroke="${colors[cur]}" stroke-width="2.2" stroke-linejoin="round"/>`;
      d = `M ${X(p.x).toFixed(2)} ${Y(p.y).toFixed(2)} `; cur = p.seg;
    } else d += `L ${X(p.x).toFixed(2)} ${Y(p.y).toFixed(2)} `;
  }
  if (d) g += `<path d="${d}" fill="none" stroke="${colors[cur]}" stroke-width="2.2" stroke-linejoin="round"/>`;
  g += `<text x="${px + 10}" y="${py + 20}" fill="#e6edf3" font-size="14">${title}</text>`;
  const lines = [
    `R_min = ${m.Rmin.toFixed(2)} мм   излом = ${m.maxTurn.toFixed(1)}°`,
    `зазор = ${m.minGap === Infinity ? '—' : m.minGap.toFixed(2) + ' мм'}   длина = ${m.len.toFixed(0)} мм`,
  ];
  lines.forEach((t, i) => g += `<text x="${px + 10}" y="${py + ph - 26 + i * 16}" fill="#9fb0c0" font-size="12">${t}</text>`);
  g += `</g>`;
  return g;
};

let x = 20;
for (const v of variants) {
  const m = metrics(v.pts);
  svg += panel(x, 30, 560, 400, v.pts, v.color, v.title, m, 0);
  svg += panel(x, 450, 560, 300, v.pts, v.color, v.title + ' — крупный план центра', m, 7.0);
  x += 580;
}

// профиль канала — отдельной строкой
svg += `<text x="20" y="782" fill="#e6edf3" font-size="14">Профиль межканального расстояния: по оси — радиус дорожки, по вертикали — зазор между ветвями</text>`;
for (const v of variants) {
  const prof = channelProfile(v.pts);
  if (!prof.length) continue;
  const px = 20 + variants.indexOf(v) * 580, py = 800, pw = 560, ph = 160;
  const rMin = prof[0].r, rMax = prof[prof.length - 1].r;
  const gMax = Math.max(2, ...prof.map(p => p.gap));
  const X = (r) => px + 40 + (r - rMin) / (rMax - rMin || 1) * (pw - 70);
  const Y = (gap) => py + ph - 30 - (gap / gMax) * (ph - 60);
  let d = '';
  for (const p of prof) d += `${d ? 'L' : 'M'} ${X(p.r).toFixed(1)} ${Y(p.gap).toFixed(1)} `;
  svg += `<path d="${d}" fill="none" stroke="${v.color}" stroke-width="2"/>`;
  svg += `<text x="${px + 40}" y="${py + ph - 6}" fill="#9fb0c0" font-size="11">${v.title}</text>`;
  svg += `<line x1="${px + 40}" y1="${py + ph - 30}" x2="${px + pw - 30}" y2="${py + ph - 30}" stroke="#26303d"/>`;
  svg += `<line x1="${px + 40}" y1="${py + 20}" x2="${px + 40}" y2="${py + ph - 30}" stroke="#26303d"/>`;
}
svg += `<text x="20" y="985" fill="#6f8090" font-size="11">Оранжевый — завиток/разворот, синий и бирюзовый — ветви спирали, зелёный — внешняя граница ячейки.</text>`;
svg += `</svg>`;

writeFileSync(OUT, svg);
writeFileSync(OUT_DIR + 'stand-centers.html',
  '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0e1218">' + svg + '</body>');
console.log('SVG записан:', OUT);
for (const v of variants) {
  const m = metrics(v.pts);
  console.log(`${v.title}\n  R_min=${m.Rmin.toFixed(3)} мм  излом=${m.maxTurn.toFixed(1)}°  зазор=${m.minGap.toFixed(3)} мм  длина=${m.len.toFixed(0)} мм`);
}
