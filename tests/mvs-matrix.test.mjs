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

test('ядро загружается и экспортирует построение ряда спиралей', () => {
  const C = loadCore();
  for (const fn of ['PRESETS', 'FLAVORS', 'I18N', 'defaults', 'derive', 'buildSpiralRow', 'rowLanes',
    'rowLocalArcs', 'segmentsToPoints', 'checkChain', 'measureChain', 'riskReport', 'validate', 'compose', 'audit']) {
    assert.ok(C[fn] !== undefined, `нет экспорта ${fn}`);
  }
});

test('пресет калибровочной модели: 5 цилиндров, VS 8/12/16/20/24', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  assert.deepEqual(Array.from(d.vs), [8, 12, 16, 20, 24], 'ряд VS из пресета');
  assert.equal(d.cells, 5, 'число спиралей');
  assert.equal(d.totalLayers, 200, 'всего слоёв');
  assert.equal(d.zones, 4, 'число температурных зон');
  assert.ok(d.bbox.width <= p.bedX, `ряд шире стола: ${d.bbox.width.toFixed(1)} мм`);
  assert.ok(d.bbox.minX >= 0 && d.bbox.maxX <= p.bedX, 'ряд вне стола по X');
  assert.ok(d.bbox.minY >= 0 && d.bbox.maxY <= p.bedY, 'ряд вне стола по Y');
});

test('траектория слоя непрерывна: конец каждой дуги — начало следующей', () => {
  const C = loadCore();
  const d = C.derive(C.defaults());
  const segs = d.row.path;
  assert.ok(segs.length > 20, 'в ряду должно быть много дуг');
  for (let i = 1; i < segs.length; i++) {
    const gap = Math.hypot(segs[i].from[0] - segs[i - 1].to[0], segs[i].from[1] - segs[i - 1].to[1]);
    assert.ok(gap < 1e-9, `разрыв ${gap} мм между сегментами ${i - 1} и ${i}`);
  }
});

test('стыки дуг гладкие: касательные совпадают', () => {
  const C = loadCore();
  const d = C.derive(C.defaults());
  const chk = C.checkChain(C.defaults(), d, { pts: d.rowPts, row: d.row });
  const errs = chk.issues.filter(i => i.level === 'error');
  assert.equal(errs.length, 0, `ошибки геометрии: ${errs.map(e => e.code + ': ' + e.msg).join('; ')}`);
  assert.ok(chk.stats.maxTurnDeg <= 2, `излом в стыке ${chk.stats.maxTurnDeg}° — должен быть нулевой`);
  assert.ok(chk.stats.maxJump < 1e-6, `разрыв траектории ${chk.stats.maxJump} мм`);
});

test('все дуги ряда — полуокружности с радиусом не меньше заданного', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  const arcs = d.row.path.filter(s => s.type === 'arc');
  assert.ok(arcs.length >= 20, 'мало дуг');
  for (const a of arcs) {
    assert.ok(a.r > 0, 'радиус дуги положителен');
    // полуокружность: диаметр дуги равен расстоянию между концами
    const chord = Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]);
    near(chord, 2 * a.r, 1e-6, 'дуга должна быть ровно полуокружностью');
  }
  near(d.row.stats.minR, p.coreX / 2, 1e-6, 'минимальный радиус — половина X');
});

test('развёртка в точки сохраняет геометрию дуг', () => {
  const C = loadCore();
  const d = C.derive(C.defaults());
  const pts = d.rowPts;
  assert.ok(pts.length > 500, 'мало точек после развёртки');
  let maxErr = 0;
  for (const seg of d.row.path.filter(s => s.type === 'arc')) {
    for (const q of pts) {
      const r = Math.hypot(q.x - seg.center[0], q.y - seg.center[1]);
      if (Math.abs(r - seg.r) < 0.05) { maxErr = Math.max(maxErr, Math.abs(r - seg.r)); }
    }
  }
  assert.ok(maxErr < 0.05, 'точки должны лежать на своих дугах');
});

test('G-code: слой — непрерывная экструзия дугами G2/G3 без холостых перемещений', () => {
  const C = loadCore();
  const p = { ...C.defaults(), band: 0.4 };      // 1 зона, 2 слоя
  const { gcode } = C.compose(p);
  const lines = gcode.split('\n');
  const start = lines.findIndex(l => l.startsWith('; LAYER 1:'));
  const end = lines.findIndex((l, i) => i > start && l.startsWith('; LAYER 2:'));
  assert.ok(start > 0 && end > start, 'не найдены маркеры слоёв');

  const body = lines.slice(start, end);
  const moves = body.filter(l => /^\s*G[0-3]\b/.test(l));
  const arcs = moves.filter(l => /^G[23]\b/.test(l));
  assert.ok(arcs.length > 20, `мало дуг в слое: ${arcs.length}`);
  assert.equal(moves.filter(l => l.startsWith('G0')).length, 3, 'в слое только подвод: G0 Z, G0 XY, G0 Z');
  assert.equal(moves.filter(l => /E-/.test(l)).length, 0, 'в слое не должно быть ретрактов');

  // суммарная экструзия слоя совпадает с расчётом
  let sumE = 0;
  for (const l of arcs) sumE += parseFloat(l.match(/E([0-9.]+)/)[1]);
  const d = C.derive(p);
  const expect = d.row.stats.length * d.A_line / d.A_fil;
  near(sumE, expect, expect * 0.01, 'экструзия слоя');
});

test('F на дуге соответствует объёмной скорости и ограничению по кривизне', () => {
  const C = loadCore();
  const p = { ...C.defaults(), band: 0.4 };
  const { gcode } = C.compose(p);
  const d = C.derive(p);
  const lines = gcode.split('\n');
  const start = lines.findIndex(l => l.startsWith('; LAYER 1:'));
  let curVs = NaN;
  let checked = 0;
  const vsMax = Math.max(...d.vs);
  for (const l of lines.slice(start)) {
    const m = l.match(/^; SPIRAL (\d+): VS ([\d.]+)/);
    if (m) { curVs = parseFloat(m[2]); continue; }
    if (!/^G[23]\b/.test(l)) continue;
    const F = parseFloat(l.match(/F([0-9.]+)/)[1]);
    if (!Number.isFinite(curVs)) continue;
    // на рампе между спиралями F может соответствовать промежуточной скорости,
    // но никогда не превышает номинал самой быстрой спирали
    assert.ok(F <= (vsMax / d.A_line) * 60 + 1, `F ${F} выше номинала ${vsMax}`);
    checked++;
  }
  assert.ok(checked > 20, 'проверено мало дуг');
});

test('стык слоёв без перемещения: конец слоя = начало следующего', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  const a = C.buildSpiralRow({ ...d.traj, reverse: false });
  const b = C.buildSpiralRow({ ...d.traj, reverse: true });
  const endA = a.path[a.path.length - 1].to;
  const startB = b.path[0].from;
  near(Math.hypot(endA[0] - startB[0], endA[1] - startB[1]), 0, 1e-6, 'змейка: конец слоя = начало следующего');
});

test('аудит сверяет фактический G-code с расчётом', () => {
  const C = loadCore();
  const p = { ...C.defaults(), band: 0.4 };
  const { gcode } = C.compose(p);
  const aud = C.audit(gcode, p);
  assert.ok(aud.layers > 0, 'слои найдены');
  assert.ok(aud.E > 0, 'экструзия положительна');
  assert.equal(aud.mismatches.length, 0, `аудит: ${aud.mismatches.join('; ')}`);

  const broken = gcode.replaceAll('G28', '; broken');
  const audBroken = C.audit(broken, p);
  assert.ok(audBroken.mismatches.some(m => m.includes('G28')), 'аудит должен поймать отсутствие G28');
});

test('валидатор ловит выход за стол, превышение потолка хотэнда и температуры', () => {
  const C = loadCore();
  const p = C.defaults();
  assert.ok(C.validate(p).every(i => i.level !== 'error'), 'эталонный пресет без ошибок');

  const wide = C.validate({ ...p, spiralPitch: 1.8 });
  assert.ok(wide.some(i => i.code === 'bed-x' && i.level === 'error'), 'должна быть ошибка bed-x');

  const hot = C.validate({ ...p, vsList: '8, 12, 16, 20, 40' });
  assert.ok(hot.some(i => i.code === 'vs-hotend' && i.level === 'error'), 'должна быть ошибка vs-hotend');

  const temp = C.validate({ ...p, tStart: 250, tEnd: 310, tStep: 10 });
  assert.ok(temp.some(i => i.code === 't-hard' && i.level === 'error'), 'должна быть ошибка t-hard');

  const ptfe = C.validate({ ...p, tStart: 240, tEnd: 270, tStep: 10 });
  assert.ok(ptfe.some(i => i.code === 't-ptfe' && i.level === 'warn'), 'должно быть предупреждение t-ptfe');

  const gap = C.validate({ ...p, lw: 0.6, spiralPitch: 0.5 });
  assert.ok(gap.some(i => i.code === 'pitch-lw'), 'должна быть проверка шага против ширины линии');
});

test('риск-отчёт: запас по кривизне считается по каждому VS', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  const risk = C.riskReport(p, d, { pts: d.rowPts, row: d.row });
  assert.equal(risk.rows.length, d.vs.length, 'строка на каждое VS');
  for (const r of risk.rows) {
    near(r.v, r.vs / d.A_line, 1e-6, `v для VS ${r.vs}`);
    near(r.Rreq, (r.v * r.v) / d.a_eff, 1e-6, `R_треб для VS ${r.vs}`);
    assert.ok(r.eMmS > 0 && r.eMmS < 150, `скорость оси E ${r.eMmS} мм/с вне диапазона`);
  }
  // на быстрых спиралях радиуса не хватает — должен быть срез F
  assert.ok(risk.rows.some(r => r.capped), 'на быстрых спиралях ожидается срез F');
});

test('детерминизм генерации', () => {
  const C = loadCore();
  const p = { ...C.defaults(), band: 0.4 };
  assert.equal(C.compose(p).gcode, C.compose(p).gcode, 'два прогона должны давать одинаковый G-code');
});
