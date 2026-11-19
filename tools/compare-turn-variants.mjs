// Сравнение вариантов центрального разворота двойной спирали.
// Варианты строятся в одном локальном фрейме ячейки (центр в 0,0).
// Метрики: минимальный радиус кривизны, длина центрального участка,
// равномерность шага между соседними участками, разрывы касательной.

const D2R = Math.PI / 180;

function curvatureRadius(pts, i) {
  if (i <= 0 || i >= pts.length - 1) return Infinity;
  const a = pts[i - 1], b = pts[i], c = pts[i + 1];
  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ca = Math.hypot(a.x - c.x, a.y - c.y);
  if (ab < 1e-9 || bc < 1e-9 || ca < 1e-9) return Infinity;
  const s = (ab + bc + ca) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - ab) * (s - bc) * (s - ca)));
  if (area < 1e-9) return Infinity;
  return (ab * bc * ca) / (4 * area);
}

function smoothstep(u) { return u * u * (3 - 2 * u); }

// Единая общая геометрия: спираль с завитком в центре.
// mode: 'hub' — завиток с расширенным центром; 'hairpin' — прежний разворот.
function buildCell(cfg) {
  const { R_out, r_min, g, n, th0, hubR, mode } = cfg;
  const pts = [];
  const chord = cfg.chord || 1.2;
  const maxTurnDeg = 5;

  const dTh = Math.min(maxTurnDeg * D2R, chord / ((R_out + r_min) / 2));
  const push = (x, y, seg) => pts.push({ x, y, seg });

  if (mode === 'hairpin') {
    // Прежняя реализация: полуокружность радиусом g/2
    const total = 2 * Math.PI * n;
    const steps = Math.max(24, Math.ceil(total / (maxTurnDeg * D2R)));
    let r = R_out, th = th0;
    for (let i = 0; i <= steps; i++) { push(r * Math.cos(th), r * Math.sin(th), 'branchA'); r -= (R_out - r_min) / steps; th += total / steps; }
    const thEnd = th0 + total;
    const turnR = g / 2;
    const cX = (r_min - turnR) * Math.cos(thEnd), cY = (r_min - turnR) * Math.sin(thEnd);
    const tSteps = Math.max(24, Math.ceil(Math.PI / (3 * D2R)));
    for (let i = 1; i <= tSteps; i++) {
      const phi = Math.PI * i / tSteps;
      push(cX + turnR * (Math.cos(phi) * Math.cos(thEnd) - Math.sin(phi) * Math.sin(thEnd)),
           cY + turnR * (Math.cos(phi) * Math.sin(thEnd) + Math.sin(phi) * Math.cos(thEnd)), 'turn');
    }
    const rB = r_min - g;
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      push((rB + (R_out - g - rB) * u) * Math.cos(thEnd - total * u),
           (rB + (R_out - g - rB) * u) * Math.sin(thEnd - total * u), 'branchB');
    }
    for (let i = 1; i <= 24; i++) {
      const u = i / 24;
      const r = (R_out - g) + g * u, th = th0 - Math.PI * u;
      push(r * Math.cos(th), r * Math.sin(th), 'close');
    }
    return pts;
  }

  // --- Вариант 'hub': спираль с плавным завитком в центре ---
  const taper = 1.0;                       // доля оборота на сглаживание шага
  const nA = Math.max(0.9, n - 0.5);
  const Rt = Math.max(g / 2, Math.min(hubR, (R_out - r_min) * 0.45));
  const q = g;                             // шаг по радиусу за оборот
  const qPerRad = q / (2 * Math.PI);

  // Ветвь A: равномерный шаг, затем сглаживание шага до нуля.
  const totalA = 2 * Math.PI * nA;
  const nTaper = Math.round(taper * 2 * Math.PI / dTh);
  const nUniform = Math.max(4, Math.round((totalA - taper * 2 * Math.PI) / dTh));
  let r = R_out, th = th0;
  for (let i = 0; i < nUniform; i++) { th += dTh; r -= qPerRad * dTh; push(r * Math.cos(th), r * Math.sin(th), 'branchA'); }
  for (let i = 1; i <= nTaper; i++) {
    const u = i / nTaper;
    th += dTh;
    r -= qPerRad * dTh * (1 - smoothstep(u));
    push(r * Math.cos(th), r * Math.sin(th), 'branchA');
  }
  const rA = r, thA = th;

  // Завиток: полуокружность радиуса Rt, центр на радиальной линии угла thA.
  const uX = Math.cos(thA), uY = Math.sin(thA);
  const wX = -uY, wY = uX;
  const cX = (rA - Rt) * uX, cY = (rA - Rt) * uY;
  const tSteps = Math.max(24, Math.ceil(Math.PI / (3 * D2R)));
  for (let i = 1; i <= tSteps; i++) {
    const phi = Math.PI * i / tSteps;
    const cs = Math.cos(phi), sn = Math.sin(phi);
    push(cX + Rt * (cs * uX + sn * wX), cY + Rt * (cs * uY + sn * wY), 'turn');
  }
  const rB = rA - 2 * Rt;

  // Ветвь B: наружу, угол убывает; шаг сглаживается от нуля до qB.
  // qB подбирается так, чтобы конец ветви вышел на R_out - g.
  const nB = nA;
  const totalB = 2 * Math.PI * nB;
  const nTaperB = nTaper;
  const nUniformB = Math.max(4, Math.round((totalB - taper * 2 * Math.PI) / dTh));
  // gain при qB = 1 (в радианах угла): сумма интеграла (1-S)
  let gainUnit = 0;
  for (let i = 1; i <= nTaperB; i++) { const u = i / nTaperB; gainUnit += dTh * smoothstep(u); }
  gainUnit += dTh * nUniformB;
  const need = (R_out - g) - rB;
  const qB = need / (qPerRad * gainUnit);

  let rb = rB, thb = thA;
  for (let i = 1; i <= nTaperB; i++) {
    const u = i / nTaperB;
    thb -= dTh;
    rb += qPerRad * qB * dTh * smoothstep(u);
    push(rb * Math.cos(thb), rb * Math.sin(thb), 'branchB');
  }
  for (let i = 1; i <= nUniformB; i++) {
    thb -= dTh;
    rb += qPerRad * qB * dTh;
    push(rb * Math.cos(thb), rb * Math.sin(thb), 'branchB');
  }
  // Замыкающая дуга: от (R_out - g, th0) до (R_out, th0 - PI)
  for (let i = 1; i <= 24; i++) {
    const u = i / 24;
    const rr = (R_out - g) + g * u, tt = th0 - Math.PI * u;
    push(rr * Math.cos(tt), rr * Math.sin(tt), 'close');
  }
  return pts;
}

function metrics(pts, R_out, r_min, g) {
  let Rmin = Infinity, at = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const R = curvatureRadius(pts, i);
    if (R < Rmin) { Rmin = R; at = i; }
  }
  // максимум изменения направления
  let maxTurn = 0, turnAt = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const v1 = [pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y];
    const v2 = [pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y];
    const n1 = Math.hypot(...v1), n2 = Math.hypot(...v2);
    if (n1 < 1e-9 || n2 < 1e-9) continue;
    const dot = (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2);
    const deg = Math.acos(Math.max(-1, Math.min(1, dot))) / D2R;
    if (deg > maxTurn) { maxTurn = deg; turnAt = i; }
  }
  // равномерность шага между соседними дорожками: расстояние от точки до отрезка
  const cell = Math.max(0.2, 0.48);
  const grid = new Map();
  for (let i = 0; i < pts.length; i++) {
    const k = Math.floor(pts[i].x / cell) + ',' + Math.floor(pts[i].y / cell);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const distToSeg = (p, a, b) => {
    const vx = b.x - a.x, vy = b.y - a.y;
    const L2 = vx * vx + vy * vy;
    if (L2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
  };
  let minDist = Infinity;
  for (const bucket of grid.values()) {
    for (const i of bucket) {
      const ix = Math.floor(pts[i].x / cell), iy = Math.floor(pts[i].y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const other = grid.get((ix + dx) + ',' + (iy + dy));
        if (!other) continue;
        for (const j of other) {
          if (j <= i + 3) continue;
          // участок завитка — намеренный hairpin: точки там сбиваются
          if (pts[i].seg === 'turn' || pts[j].seg === 'turn') continue;
          if (pts[i - 1].seg === 'turn' || pts[j - 1].seg === 'turn') continue;
          const dd = Math.min(
            distToSeg(pts[i], pts[j - 1], pts[j]),
            distToSeg(pts[j], pts[i - 1], pts[i])
          );
          if (dd < minDist) minDist = dd;
        }
      }
    }
  }
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let hubLen = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].seg === 'turn' || pts[i - 1].seg === 'turn') {
      hubLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
  }
  return { Rmin, RminAt: at, maxTurn, turnAt, minDist, len, hubLen };
}

// ---- исходные параметры эталонного пресета ----
const A_line = 0.096, aEff = 8000;
const R_out = 10.1886, r_min = 5.98, g = 1.2, n = 1.75;
const th0 = 211.34 * D2R;
const Vmax = 21 / A_line;

const variants = [
  { name: 'V0 hairpin (текущий)', mode: 'hairpin', hubR: 0 },
  { name: 'V1 завиток R=2 мм', mode: 'hub', hubR: 2 },
  { name: 'V2 завиток R=3 мм', mode: 'hub', hubR: 3 },
  { name: 'V3 завиток R=кинематический (V²/a)', mode: 'hub', hubR: Vmax * Vmax / aEff },
];

console.log('R_out =', R_out.toFixed(2), ' r_min =', r_min.toFixed(2), ' g =', g, ' n =', n);
console.log('V_max =', Vmax.toFixed(1), ' мм/с;  R по кинематике V²/a =', (Vmax * Vmax / aEff).toFixed(2), ' мм\n');
console.log('вариант'.padEnd(34), 'R_min, мм'.padStart(11), 'излом, °'.padStart(11), 'мин. зазор'.padStart(12), 'длина, мм'.padStart(11), 'завиток, мм'.padStart(12));
for (const v of variants) {
  const pts = buildCell({ R_out, r_min, g, n, th0, hubR: v.hubR, mode: v.mode });
  const m = metrics(pts, R_out, r_min, g);
  console.log(v.name.padEnd(34), m.Rmin.toFixed(3).padStart(11), m.maxTurn.toFixed(1).padStart(11),
    m.minDist.toFixed(3).padStart(12), m.len.toFixed(1).padStart(11), m.hubLen.toFixed(1).padStart(12));
}
