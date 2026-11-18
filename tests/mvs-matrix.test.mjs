import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const html = readFileSync(fileURLToPath(new URL('../tools/mvs-matrix.html', import.meta.url)), 'utf8');
const MARKER = '/* ============ ИНТЕРФЕЙС ============ */';

function loadCore() {
  const cut = html.indexOf(MARKER);
  assert.ok(cut > 0, 'в tools/mvs-matrix.html не найден маркер интерфейса');
  const start = html.indexOf('<script>');
  assert.ok(start > 0, 'в tools/mvs-matrix.html не найден тег <script>');
  const ctx = { module: { exports: {} } };
  vm.createContext(ctx);
  vm.runInContext(html.slice(start + '<script>'.length, cut), ctx, { filename: 'mvs-matrix.core.js' });
  return ctx.module.exports;
}

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ожидалось ${b} ± ${eps}, получено ${a}`);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('ядро загружается и экспортирует необходимые функции', () => {
  const C = loadCore();
  for (const fn of ['PRESETS', 'FLAVORS', 'I18N', 'defaults', 'derive', 'spiralCell', 'linkPath',
    'chainPath', 'pathFeeds', 'measureChain', 'checkChain', 'validate', 'compose', 'audit']) {
    assert.ok(C[fn] !== undefined, `нет экспорта ${fn}`);
  }
});

test('derive на эталоне PLA/A1 mini', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  near(d.A_line, 0.096, 1e-4, 'A_line');
  near(d.A_fil, 2.40528, 1e-3, 'A_fil');
  near(d.R_out, 12.26, 1e-3, 'R_out');
  near(d.g, 1.20, 1e-3, 'g');
  near(d.v_max, 208.333, 0.1, 'v_max');
  near(d.r_min, 5.425, 0.05, 'r_min');
  assert.ok(d.n >= 2.5 && d.n <= 3.2, `витки n ожидались около 2.85, получено ${d.n}`);
  assert.equal(d.cells, 6, 'число ячеек');
  assert.equal(d.zones, 4, 'число зон');
  assert.equal(d.layersPerZone, 50, 'слоев на зону');
  assert.equal(d.totalLayers, 200, 'всего слоев');
  near(d.totalHeight, 40.0, 1e-3, 'высота модели');
  assert.equal(d.cellCenters.length, 6, 'центры ячеек');
  near(d.cellCenters[1].cx - d.cellCenters[0].cx, p.pitch, 1e-6, 'шаг между центрами');
});

test('ячейка: вход и выход на противоположных сторонах, радиус в границах', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  const cell = C.spiralCell(p, d, {});
  const first = cell[0], last = cell[cell.length - 1];

  // Вход и выход лежат на противоположных сторонах цилиндра
  const thIn = Math.atan2(first.y, first.x);
  const thOut = Math.atan2(last.y, last.x);
  let diff = Math.abs(thIn - thOut) * 180 / Math.PI;
  if (diff > 180) diff = 360 - diff;
  near(diff, 180, 1e-6, 'вход и выход на противоположных сторонах');

  near(Math.hypot(first.x, first.y), d.R_out, 1e-6, 'вход на внешнем радиусе');
  near(Math.hypot(last.x, last.y), d.R_out, 1e-6, 'выход на внешнем радиусе');

  let rMin = Infinity, rMax = 0;
  for (const q of cell) {
    const r = Math.hypot(q.x, q.y);
    rMin = Math.min(rMin, r);
    rMax = Math.max(rMax, r);
  }
  near(rMax, d.R_out, 1e-6, 'максимальный радиус ячейки');
  near(rMin, d.r_min - d.g, 1e-6, 'минимальный радиус ячейки');
});

test('две ветви спирали идут параллельно со смещением ровно g', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  const cell = C.spiralCell(p, d, {});
  const a = cell.filter(q => q.seg === 'branchA');
  const b = cell.filter(q => q.seg === 'branchB');
  assert.ok(a.length > 50 && b.length > 50, 'обе ветви должны быть длинными');

  // На каждом угле ветвь B идёт ровно на одну дорожку (g) внутри ветви A.
  let checked = 0, worst = 0;
  for (const q of b) {
    const th = Math.atan2(q.y, q.x);
    const rB = Math.hypot(q.x, q.y);
    let best = null, bestD = Infinity;
    for (const s of a) {
      let dth = Math.abs(Math.atan2(s.y, s.x) - th) % (2 * Math.PI);
      if (dth > Math.PI) dth = 2 * Math.PI - dth;
      if (dth < bestD) { bestD = dth; best = s; }
    }
    if (!best) continue;
    const rA = Math.hypot(best.x, best.y);
    worst = Math.max(worst, Math.abs((rA - rB) - d.g));
    checked++;
  }
  assert.ok(checked > 50, `проверено слишком мало пар точек: ${checked}`);
  assert.ok(worst < 0.06, `смещение ветвей отличается от g на ${worst.toFixed(3)} мм`);
});

test('цепочка слоя — одна непрерывная линия через все ячейки', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  const chain = C.chainPath(p, d, {});
  const pts = chain.pts;

  assert.ok(pts.length > 500, `слишком мало точек: ${pts.length}`);
  assert.equal(chain.links.length, d.cells - 1, 'переходов должно быть на одну меньше, чем ячеек');

  // Непрерывность: каждый шаг не больше длины хорды
  let maxStep = 0;
  for (let i = 1; i < pts.length; i++) maxStep = Math.max(maxStep, dist(pts[i], pts[i - 1]));
  assert.ok(maxStep <= p.quality * 1.5, `шаг ${maxStep} мм больше хорды ${p.quality} мм`);

  // Все ячейки пройдены, переходы — между ними
  const visited = new Set(pts.map(q => q.cell));
  for (let i = 0; i < d.cells; i++) assert.ok(visited.has(i), `ячейка ${i + 1} не пройдена`);
  assert.ok(visited.has(-1), 'в цепочке нет переходов');

  // Порядок: ячейки идут подряд, переход связывает соседей
  const seq = [];
  for (const q of pts) {
    const key = q.cell >= 0 ? `c${q.cell}` : `l${q.toCell}`;
    if (seq[seq.length - 1] !== key) seq.push(key);
  }
  assert.deepEqual(seq, ['c0', 'l1', 'c1', 'l2', 'c2', 'l3', 'c3', 'l4', 'c4', 'l5', 'c5']);
});

test('переход лежит в зазоре и не заходит внутрь цилиндров', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  const chain = C.chainPath(p, d, {});

  for (const q of chain.pts) {
    if (q.cell >= 0) continue;
    for (const c of d.cellCenters) {
      const r = Math.hypot(q.x - c.cx, q.y - c.cy);
      assert.ok(r >= d.R_out - 1e-6, `переход внутри цилиндра: r=${r.toFixed(3)} < ${d.R_out.toFixed(3)}`);
    }
  }

  // Переход — общая касательная: прямой и гладкий отрезок между цилиндрами
  for (const l of chain.links) {
    assert.ok(l.length > 1, 'переход должен иметь длину');
    assert.ok(l.amp < 1e-6, `переход должен быть прямым, отклонение ${l.amp.toFixed(3)} мм`);
  }
});

test('математические проверки траектории проходят на эталоне', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  const chain = C.chainPath(p, d, {});
  const chk = C.checkChain(p, d, chain);
  const errs = chk.issues.filter(i => i.level === 'error');
  assert.equal(errs.length, 0, `ошибки геометрии: ${errs.map(e => e.code + ': ' + e.msg).join('; ')}`);
  assert.ok(chk.stats.minDist >= p.lw * 0.9, `минимальное расстояние ${chk.stats.minDist}`);
  assert.ok(chk.stats.maxTurnDeg < 25, `излом ${chk.stats.maxTurnDeg}° слишком велик`);
  assert.ok(chk.stats.maxJump <= p.quality * 1.5, `разрыв ${chk.stats.maxJump} мм`);
});

test('длина траектории ячейки одинакова для всех ячеек', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  const meas = C.measureChain(p, d, C.chainPath(p, d, {}));
  const l0 = meas.cells[0].len;
  for (const c of meas.cells) near(c.len, l0, 1e-6, 'длина траектории ячейки');
  assert.ok(l0 > 300 && l0 < 900, `длина траектории ячейки вне ожидаемого диапазона: ${l0.toFixed(0)} мм`);
  assert.ok(meas.links.length === d.cells - 1, 'переходы посчитаны');
  assert.ok(meas.total > l0 * d.cells * 0.9, 'длина слоя слишком мала');
});

test('G-code: слой — одна непрерывная экструзия без travel и ретрактов', () => {
  const C = loadCore();
  const p = { ...C.defaults(), tEnd: 190, band: 0.4 };   // 1 зона, 2 слоя
  const { gcode } = C.compose(p);
  const lines = gcode.split('\n');

  // Выделяем тело первого слоя: от маркера LAYER 1 до маркера LAYER 2
  const start = lines.findIndex(l => l.startsWith('; LAYER 1:'));
  const end = lines.findIndex((l, i) => i > start && l.startsWith('; LAYER 2:'));
  assert.ok(start > 0 && end > start, 'не найдены маркеры слоёв');

  const body = lines.slice(start, end);
  const moves = body.filter(l => /^\s*G[01]\b/.test(l));
  const extr = moves.filter(l => l.startsWith('G1') && /E[0-9.]/.test(l));
  assert.ok(extr.length > 500, `слишком мало экструзионных движений: ${extr.length}`);

  // После первой экструзии внутри слоя — только экструдирующие G1:
  // ни холостых перемещений, ни ретрактов.
  const firstExtr = moves.indexOf(extr[0]);
  const after = moves.slice(firstExtr);
  const travels = after.filter(l => l.startsWith('G0'));
  const retracts = after.filter(l => /E-/.test(l));
  const noE = after.filter(l => l.startsWith('G1') && !/E[0-9.]/.test(l));
  assert.equal(travels.length, 0, `в слое есть холостые перемещения: ${travels.length}`);
  assert.equal(retracts.length, 0, `в слое есть ретракты: ${retracts.length}`);
  assert.equal(noE.length, 0, `в слое есть движения без экструзии: ${noE.length}`);

  // Суммарная экструзия слоя совпадает с расчётом
  let sumE = 0;
  for (const l of extr) sumE += parseFloat(l.match(/E([0-9.]+)/)[1]);
  const d = C.derive(p);
  const chain = C.chainPath(p, d, {});
  const expect = C.chainLength(chain.pts) * d.A_line / d.A_fil;
  near(sumE, expect, expect * 0.01, 'экструзия слоя');
});

test('стык слоёв без перемещения: конец слоя равен началу следующего', () => {
  const C = loadCore();
  const p = { ...C.defaults(), tEnd: 190, band: 0.6 };   // 3 слоя
  const d = C.derive(p);
  const a = C.chainPath(p, d, { flip: false });
  const b = C.chainPath(p, d, { flip: true });
  const endA = a.pts[a.pts.length - 1];
  const startB = b.pts[0];
  assert.ok(dist(endA, startB) < 1e-6, `конец слоя (${endA.x.toFixed(2)},${endA.y.toFixed(2)}) не совпал с началом следующего (${startB.x.toFixed(2)},${startB.y.toFixed(2)})`);
});

test('VS плавно меняется на переходе', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  const chain = C.chainPath(p, d, {});
  // первый переход: ячейка 1 -> ячейка 2
  const link = chain.pts.filter(q => q.cell === -1 && q.toCell === 1);
  assert.ok(link.length > 3, 'переход должен состоять из нескольких точек');
  const last = link[link.length - 1];
  near(last.vs, d.vs[1], 1e-9, 'конец перехода — VS следующей ячейки');
  // Начало рампы: последняя точка ячейки перед переходом
  const idx = chain.pts.indexOf(link[0]);
  near(chain.pts[idx - 1].vs, d.vs[0], 1e-9, 'начало перехода — VS предыдущей ячейки');
  // монотонность рампы
  for (let i = 1; i < link.length; i++) {
    assert.ok(link[i].vs >= link[i - 1].vs - 1e-9, 'рампа VS должна быть монотонной');
  }
  assert.ok(link[0].vs > d.vs[0] && link[0].vs < d.vs[1], 'рампа должна идти между значениями');
});

test('F на каждом участке не превышает допустимое ускорением по кривизне', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  const chain = C.chainPath(p, d, {});
  const feeds = C.pathFeeds(p, d, chain.pts);
  assert.equal(feeds.length, chain.pts.length);
  for (let i = 1; i < chain.pts.length; i++) {
    const f = feeds[i].F;
    const v = f / 60;
    const R = C.curvatureRadius ? C.curvatureRadius(chain.pts, i) : Infinity;
    if (Number.isFinite(R)) {
      assert.ok((v * v) / R <= d.a_eff * 1.05, `ускорение превышено в точке ${i}`);
    }
  }
});

test('слой-метка (bead): переход остаётся касательной', () => {
  const C = loadCore();
  const p = { ...C.defaults(), beadOn: true, beadSize: 0.6 };
  const d = C.derive(p);
  const chain = C.chainPath(p, d, { bead: true });
  const chk = C.checkChain(p, d, chain);
  const errs = chk.issues.filter(i => i.level === 'error');
  assert.equal(errs.length, 0, `ошибки геометрии метки: ${errs.map(e => e.code + ': ' + e.msg).join('; ')}`);
  for (const l of chain.links) {
    assert.ok(l.amp < 1e-6, `переход метки должен быть прямым, отклонение ${l.amp.toFixed(3)} мм`);
  }
});

test('валидатор ловит ошибки геометрии и лимитов', () => {
  const C = loadCore();
  const p = C.defaults();

  const errPitch = C.validate({ ...p, pitch: 30, diameter: 36 });
  assert.ok(errPitch.some(e => e.code === 'pitch'), 'должна быть ошибка pitch');

  const errBed = C.validate({ ...p, cols: 6, pitch: 42, bedX: 180, diameter: 36 });
  assert.ok(errBed.some(e => e.code === 'bed-x'), 'должна быть ошибка bed-x');

  const errGap = C.validate({ ...p, gap: 0.02 });
  assert.ok(errGap.some(e => e.code === 'gap'), 'должна быть ошибка gap');

  const errAngle = C.validate({ ...p, startAngleMode: 'manual', startAngle: 0 });
  assert.ok(errAngle.some(e => e.code === 'start-angle'), 'должно быть предупреждение о ручном угле');

  const okList = C.validate(p);
  assert.ok(!okList.some(e => e.level === 'error'), 'дефолтный конфиг не должен содержать ошибок');
});

test('детерминизм генерации G-code', () => {
  const C = loadCore();
  const p = { ...C.defaults(), tEnd: 190, band: 0.4 };
  const res1 = C.compose(p);
  const res2 = C.compose(p);
  assert.equal(res1.gcode, res2.gcode, 'два запуска с одинаковыми параметрами должны давать одинаковый G-code');
});

test('audit сверяет фактический G-code с расчетом', () => {
  const C = loadCore();
  const p = { ...C.defaults(), tEnd: 190, band: 0.4 };
  const { gcode } = C.compose(p);
  const aud = C.audit(gcode, p);
  assert.ok(aud.layers > 0, 'слои должны быть найдены');
  assert.ok(aud.E > 0, 'экструзия E должна быть положительной');
  assert.equal(aud.mismatches.length, 0, 'аудит не должен выявить расхождений');

  const broken = gcode.replaceAll('G28', '; broken');
  const audBroken = C.audit(broken, p);
  assert.ok(audBroken.mismatches.some(m => m.includes('G28')), 'аудит должен поймать отсутствие G28');
});
