// Стенд: как выглядит ряд спиралей при разных core_x по секциям.
// Строит docs/plan-vs-scaled-diameters.svg из реального ядра tools/mvs-matrix.html.
// Запуск: node tools/stand-vs-diameters.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function loadCore() {
  const html = readFileSync(root + 'tools/mvs-matrix.html', 'utf8');
  const cut = html.indexOf('/* ============ ИНТЕРФЕЙС ============ */');
  const start = html.indexOf('<script>');
  if (cut < 0 || start < 0) throw new Error('не найдено ядро в tools/mvs-matrix.html');
  const ctx = { module: { exports: {} } };
  vm.createContext(ctx);
  vm.runInContext(html.slice(start + '<script>'.length, cut), ctx, { filename: 'mvs-matrix.core.js' });
  return ctx.module.exports;
}

const C = loadCore();
const p = C.defaults();
const d = C.derive(p);
const A_line = d.A_line;
const aEff = d.a_eff;

// Требуемый радиус S-петли для заданного VS: R_треб = v²/a_eff.
const rReq = (vs) => (vs / A_line) ** 2 / aEff;

// ---- Варианты ----
const MARGIN = 1.15;   // запас по кривизне
const FLOOR = 4;       // пол по core_x (R_min ≥ 2 мм — печатаемая петля)

function progressiveItems() {
  return d.vs.map(vs => ({ coreX: Math.max(FLOOR, MARGIN * 2 * rReq(vs)) }));
}
const uniformMax = Math.max(...d.vs.map(vs => MARGIN * 2 * rReq(vs)));

const variants = [
  { key: 'today', title: 'Без автопрогрессии: core_x = 12 у всех', items: null, accent: '#6b7c8f' },
  { key: 'prog', title: 'Автопрогрессия: core_x по VS (галочка включена)', items: progressiveItems(), accent: '#3f9c6a' },
  { key: 'max', title: `Одинаковый под максимум: core_x = ${uniformMax.toFixed(1)}`, items: d.vs.map(() => ({ coreX: uniformMax })), accent: '#b4553f' }
];

// ---- Сбор метрик по каждому варианту ----
function analyse(v) {
  const traj = { ...d.traj };
  // В d.traj items уже лежит автопрогрессия — для контрольного варианта её снимаем.
  if (v.items) traj.items = v.items; else delete traj.items;
  const row = C.buildSpiralRow(traj);
  const segs = row.path;
  const bb = row.stats.bbox;
  const per = new Map();
  for (const s of segs) {
    if (s.type !== 'arc') continue;
    if (!per.has(s.spiral)) per.set(s.spiral, []);
    per.get(s.spiral).push(s);
  }
  const sections = [...per.keys()].sort((a, b) => a - b).map((sp) => {
    const arcs = per.get(sp);
    const minR = Math.min(...arcs.map(s => s.r));
    const len = arcs.reduce((acc, s) => acc + Math.PI * s.r, 0);
    const loopLen = arcs.filter(s => s.r <= minR * 1.05).reduce((acc, s) => acc + Math.PI * s.r, 0);
    const coreX = v.items ? v.items[sp - 1].coreX : p.coreX;
    const vs = d.vs[sp - 1];
    return { sp, vs, coreX, minR, len, loopShare: loopLen / len, cut: minR < rReq(vs) };
  });
  // Центр ряда — по самим точкам: в stats.bbox центра нет.
  const cx = segs.reduce((a, s) => a + (s.from[0] + s.to[0]) / 2, 0) / segs.length;
  const cy = segs.reduce((a, s) => a + (s.from[1] + s.to[1]) / 2, 0) / segs.length;
  return { row, segs, width: bb.maxX - bb.minX, minX: bb.minX, centerX: cx, centerY: cy, depth: bb.maxY - bb.minY, sections };
}

const data = variants.map(v => ({ ...v, m: analyse(v) }));

// ---- SVG ----
const S = 1.35;                    // px на мм
const W = 760, H = 890;
const CX = W / 2;                  // центр ряда на экране
const BED = p.bedX;                // 180 мм
const COLORS = ['#4d8dff', '#33c6bd', '#8bd86f', '#e6d65e', '#f29a48', '#ee5c4e'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const out = [];
const push = (s) => out.push(s);

push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-monospace, Consolas, monospace">`);
push(`<rect width="${W}" height="${H}" fill="#11161c"/>`);
push(`<text x="20" y="30" fill="#e8eef4" font-size="16">Матрица MVS: диаметр секций по VS — три варианта в одном масштабе</text>`);
push(`<text x="20" y="50" fill="#8ba0b5" font-size="11">Ряд из 5 спиралей, ${p.lw}×${p.lh} мм, VS ${d.vs.join('/')} · масштаб ${S} px/мм · контур стола ${BED} мм</text>`);

const rowTop = 86;
const rowStep = 224;

data.forEach((v, i) => {
  const y0 = rowTop + i * rowStep;
  const axisY = y0 + 62;              // ось ряда на экране
  const m = v.m;
  const xOf = (x) => CX + (x - m.centerX) * S;
  const yOf = (y) => axisY - (y - m.centerY) * S;

  push(`<text x="20" y="${y0 + 12}" fill="${v.accent}" font-size="13">${esc(v.title)}</text>`);
  const fits = m.width <= BED;
  push(`<text x="${W - 20}" y="${y0 + 12}" fill="${fits ? '#3f9c6a' : '#e0603f'}" font-size="12" text-anchor="end">ширина ${m.width.toFixed(1)} мм ${fits ? '✓ влезает' : '✗ не влезает'}</text>`);

  // Стол: полоса шириной 180 мм по X, привязанная к левому краю ряда.
  const bedLeft = xOf(m.minX) - 4 * S;
  const bedRight = bedLeft + BED * S;
  const bandTop = axisY - (m.depth / 2 + 10) * S;
  const bandH = (m.depth + 20) * S;
  push(`<rect x="${bedLeft}" y="${bandTop}" width="${bedRight - bedLeft}" height="${bandH}" fill="#1a222c" stroke="none"/>`);
  push(`<line x1="${bedLeft}" y1="${bandTop}" x2="${bedLeft}" y2="${bandTop + bandH}" stroke="#3a4a5c" stroke-dasharray="4 3"/>`);
  push(`<line x1="${bedRight}" y1="${bandTop}" x2="${bedRight}" y2="${bandTop + bandH}" stroke="#3a4a5c" stroke-dasharray="4 3"/>`);
  push(`<text x="${bedLeft - 4}" y="${bandTop + bandH + 11}" fill="#5f7286" font-size="9" text-anchor="middle">0</text>`);
  push(`<text x="${bedRight + 4}" y="${bandTop + bandH + 11}" fill="#5f7286" font-size="9" text-anchor="middle">${BED}</text>`);

  // Траектория дугами: обычные — цвет секции, у R_min (там срезается F) — красным толще
  for (const s of m.segs) {
    if (s.type !== 'arc') continue;
    const sec = m.sections[s.spiral - 1];
    const sweep = s.ccw ? 0 : 1;
    const a = `${xOf(s.from[0]).toFixed(2)} ${yOf(s.from[1]).toFixed(2)}`;
    const b = `${xOf(s.to[0]).toFixed(2)} ${yOf(s.to[1]).toFixed(2)}`;
    const r = (s.r * S).toFixed(2);
    const isLoop = sec && s.r <= sec.minR * 1.05;
    const stroke = isLoop ? '#e0603f' : COLORS[(s.spiral - 1) % COLORS.length];
    const w = isLoop ? 3.0 : 1.5;
    push(`<path d="M ${a} A ${r} ${r} 0 0 ${sweep} ${b}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`);
  }

  // Подписи секций: центр секции — среднее по её дугам.
  for (const sec of m.sections) {
    const arcs = m.segs.filter(s => s.type === 'arc' && s.spiral === sec.sp);
    const cxm = arcs.reduce((a, s) => a + (s.from[0] + s.to[0]) / 2, 0) / arcs.length;
    const cym = arcs.reduce((a, s) => a + (s.from[1] + s.to[1]) / 2, 0) / arcs.length;
    const cx = xOf(cxm);
    const cy = yOf(cym + m.depth / 2) + 30;
    push(`<text x="${cx}" y="${cy}" fill="#cdd8e3" font-size="10" text-anchor="middle">VS ${sec.vs}</text>`);
    push(`<text x="${cx}" y="${cy + 12}" fill="${sec.cut ? '#e0603f' : '#3f9c6a'}" font-size="9" text-anchor="middle">R ${sec.minR.toFixed(1)} ${sec.cut ? '· срез' : '· ок'}</text>`);
    push(`<text x="${cx}" y="${cy + 23}" fill="#6b7c8f" font-size="8" text-anchor="middle">${sec.len.toFixed(0)} мм</text>`);
  }
});

// ---- Нижняя панель: R_min против R_треб ----
const chartTop = 760;
push(`<line x1="20" y1="${chartTop - 14}" x2="${W - 20}" y2="${chartTop - 14}" stroke="#26313a"/>`);
push(`<text x="20" y="${chartTop}" fill="#e8eef4" font-size="12">Радиус S-петли против требуемого: ниже красной метки — F срезается</text>`);

const baseY = chartTop + 84;
const scaleH = 76;
const maxR = 12;
const groupW = 92;
const gx0 = 60;
const barW = 22;

d.vs.forEach((vs, i) => {
  const gx = gx0 + i * groupW;
  const need = rReq(vs);
  const today = data[0].m.sections[i].minR;
  const prog = data[1].m.sections[i].minR;
  const h = (r) => (r / maxR) * scaleH;

  push(`<rect x="${gx}" y="${baseY - h(today)}" width="${barW}" height="${h(today)}" fill="#6b7c8f"/>`);
  push(`<rect x="${gx + barW + 4}" y="${baseY - h(prog)}" width="${barW}" height="${h(prog)}" fill="#3f9c6a"/>`);
  // R_треб — красная метка
  const ny = baseY - h(need);
  push(`<line x1="${gx - 6}" y1="${ny}" x2="${gx + 2 * barW + 10}" y2="${ny}" stroke="#e0603f" stroke-width="1.6" stroke-dasharray="4 2"/>`);
  push(`<text x="${gx + barW}" y="${ny - 4}" fill="#e0603f" font-size="8" text-anchor="middle">${need.toFixed(2)}</text>`);
  push(`<text x="${gx + barW}" y="${baseY + 13}" fill="#cdd8e3" font-size="10" text-anchor="middle">VS ${vs}</text>`);
  push(`<text x="${gx + barW}" y="${baseY + 25}" fill="${today < need ? '#e0603f' : '#6b7c8f'}" font-size="8" text-anchor="middle">${today.toFixed(1)}</text>`);
  push(`<text x="${gx + barW}" y="${baseY + 35}" fill="#3f9c6a" font-size="8" text-anchor="middle">${prog.toFixed(1)}</text>`);
});

push(`<rect x="${gx0 - 34}" y="${baseY - scaleH}" width="8" height="8" fill="#6b7c8f"/><text x="${gx0 - 22}" y="${baseY - scaleH + 8}" fill="#8ba0b5" font-size="9">сегодня</text>`);
push(`<rect x="${gx0 + 24}" y="${baseY - scaleH}" width="8" height="8" fill="#3f9c6a"/><text x="${gx0 + 36}" y="${baseY - scaleH + 8}" fill="#8ba0b5" font-size="9">прогрессивный</text>`);
push(`<line x1="${gx0 + 132}" y1="${baseY - scaleH + 4}" x2="${gx0 + 152}" y2="${baseY - scaleH + 4}" stroke="#e0603f" stroke-width="1.6" stroke-dasharray="4 2"/><text x="${gx0 + 156}" y="${baseY - scaleH + 8}" fill="#8ba0b5" font-size="9">R_треб(VS)</text>`);

push('</svg>');

const svg = out.join('\n');
writeFileSync(root + 'docs/generated/plan-vs-scaled-diameters.svg', svg, 'utf8');

// ---- Сводка в консоль ----
for (const v of data) {
  const cut = v.m.sections.filter(s => s.cut).map(s => `VS ${s.vs} (R ${s.minR.toFixed(1)} < ${rReq(s.vs).toFixed(2)})`);
  console.log(`${v.title}: ширина ${v.m.width.toFixed(1)} мм, глубина ${v.m.depth.toFixed(1)} мм`);
  console.log('  ' + v.m.sections.map(s => `VS${s.vs}: R${s.minR.toFixed(1)}/${rReq(s.vs).toFixed(2)} ${s.len.toFixed(0)}мм`).join(' | '));
  console.log('  срез F: ' + (cut.length ? cut.join(', ') : 'нет'));
}
console.log('\nзаписано: docs/plan-vs-scaled-diameters.svg');
