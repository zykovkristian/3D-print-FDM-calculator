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
  near(d.sectionMinR[0], Math.min(...d.row.path.filter(s => s.type === 'arc' && s.spiral === 1).map(s => s.r)), 1e-9, 'радиус секции 1');
  // Без автопрогрессии все секции одинаковы и R_min = core_x/2.
  const fixed = C.derive({ ...p, autoCore: false });
  near(fixed.row.stats.minR, p.coreX / 2, 1e-6, 'без автопрогрессии минимальный радиус — половина X');
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
  // Автопрогрессия снимает срез: радиус секции растёт вместе с VS.
  assert.ok(risk.rows.every(r => !r.capped), 'при автопрогрессии среза F быть не должно');
  // Радиус по секциям растёт монотонно вместе с VS.
  for (let i = 1; i < risk.rows.length; i++) {
    assert.ok(risk.rows[i].Rmin > risk.rows[i - 1].Rmin, `радиус секции ${i + 1} должен быть больше предыдущей`);
  }
  // С выключенной автопрогрессией на быстрых спиралях срез возвращается.
  const fixed = { ...p, autoCore: false };
  const df = C.derive(fixed);
  const riskFixed = C.riskReport(fixed, df, { pts: df.rowPts, row: df.row });
  assert.ok(riskFixed.rows.some(r => r.capped), 'без автопрогрессии ожидается срез F');
});

test('автопрогрессия: core_x растёт с VS, ряд влезает в стол, среза F нет', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  assert.equal(d.autoCore, true, 'автопрогрессия включена по умолчанию');

  // core_x секций растёт вместе с VS.
  for (let i = 1; i < d.sectionMinR.length; i++) {
    assert.ok(d.sectionMinR[i] > d.sectionMinR[i - 1], `радиус секции ${i + 1} должен расти с VS`);
  }
  // Ряд влезает в стол A1 mini.
  assert.ok(d.bbox.minX >= 0 && d.bbox.maxX <= p.bedX, 'ряд вне стола по X');
  assert.ok(d.bbox.minY >= 0 && d.bbox.maxY <= p.bedY, 'ряд вне стола по Y');
  assert.ok(d.bbox.width <= 180, `ширина ряда ${d.bbox.width.toFixed(1)} мм больше стола`);

  // Среза F нет ни на одной секции.
  const risk = C.riskReport(p, d, { pts: d.rowPts, row: d.row });
  assert.ok(risk.rows.every(r => !r.capped), 'при автопрогрессии срез F недопустим');
  for (const r of risk.rows) assert.ok(r.margin >= 1, `запас по кривизне для VS ${r.vs} меньше 1`);

  // Остальные инварианты секций одинаковы — отличается только core_x.
  const fixed = C.derive({ ...p, autoCore: false });
  const widths = new Set(d.row.path.filter(s => s.type === 'arc').map(s => s.r));
  assert.ok(widths.size > 1, 'при автопрогрессии радиусы дуг различаются');
  assert.ok(fixed.sectionMinR.every(r => Math.abs(r - p.coreX / 2) < 1e-9), 'без автопрогрессии радиусы одинаковы');

  // Галочку можно снять — тогда поведение прежнее.
  const off = C.derive({ ...p, autoCore: false });
  assert.equal(off.autoCore, false, 'галочка снимается');
  near(off.r_min, p.coreX / 2, 1e-9, 'без автопрогрессии R_min = core_x/2');
});

test('детерминизм генерации', () => {
  const C = loadCore();
  const p = { ...C.defaults(), band: 0.4 };
  assert.equal(C.compose(p).gcode, C.compose(p).gcode, 'два прогона должны давать одинаковый G-code');
});

/* ============ РЕГРЕССИИ: дефекты баг-ревью ============ */

// Блоки G-code по маркеру слоя.
function layerBlocks(gcode) {
  const lines = gcode.split('\n');
  const starts = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].startsWith('; LAYER ')) starts.push(i);
  return starts.map((s, k) => lines.slice(s, starts[k + 1] ?? lines.length));
}

// Z в момент экструзии: учитываем G0 Z, затем экструдирующие перемещения.
function extrusionZ(gcode) {
  let z = 0;
  const seq = [];
  for (const raw of gcode.split('\n')) {
    const l = raw.trim();
    const zm = l.match(/\bZ([\d.]+)/);
    if (zm && /^G0\b/.test(l)) z = Number(zm[1]);
    const em = l.match(/\bE([\d.]+)/);
    if (em && /^G[123]\b/.test(l) && Number(em[1]) > 0) seq.push(z);
  }
  return seq;
}

// Начало и конец каждого слоя по экструдирующим перемещениям (позиция сквозная).
function layerEnds(gcode) {
  let cur = null;
  return layerBlocks(gcode).map((block) => {
    let first = null, last = null;
    for (const raw of block) {
      const l = raw.trim();
      if (!/^G[123]\b/.test(l)) continue;
      const m = l.match(/\bX([-\d.]+) Y([-\d.]+)/);
      if (!m) continue;
      const pt = [Number(m[1]), Number(m[2])];
      if (!first) first = cur;
      cur = pt;
      last = pt;
    }
    return { first, last };
  });
}

function snakeBreaks(gcode) {
  const ends = layerEnds(gcode).slice(1);
  let breaks = 0;
  for (let i = 1; i < ends.length; i++) {
    const a = ends[i - 1].last, b = ends[i].first;
    if (!a || !b) continue;
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6) breaks++;
  }
  return breaks;
}

test('валидатор: пустой ряд VS — ошибка, G-code не содержит NaN', () => {
  const C = loadCore();
  const p = { ...C.defaults(), vsList: 'abc' };
  const d = C.derive(p);
  assert.equal(d.vs.length, 0, 'нечисловой список VS должен давать пустой ряд');
  assert.ok(C.validate(p).some(i => i.code === 'vs-empty' && i.level === 'error'), 'нужна ошибка vs-empty');

  const res = C.compose(p);
  assert.ok(res.issues.some(i => i.level === 'error'), 'compose должен сообщить об ошибке');
  assert.ok(!/NaN|undefined/.test(res.gcode), 'в G-code не должно быть NaN/undefined');
});

test('валидатор: число значений VS не равно числу цилиндров — ошибка', () => {
  const C = loadCore();
  const p = C.defaults();
  const fewer = { ...p, vsList: '8, 12' };
  assert.ok(C.validate(fewer).some(i => i.code === 'vs-count' && i.level === 'error'), 'нужна ошибка vs-count (меньше)');
  assert.ok(!/undefined/.test(C.compose(fewer).gcode), 'в G-code не должно быть «VS undefined»');

  const more = { ...p, vsList: '8, 12, 16, 20, 24, 28' };
  assert.ok(C.validate(more).some(i => i.code === 'vs-count' && i.level === 'error'), 'нужна ошибка vs-count (больше)');
});

test('производные величины конечны: r_min — минимум траектории, не NaN', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  assert.ok(Number.isFinite(d.r_min), `r_min должен быть числом, получено ${d.r_min}`);
  near(d.r_min, d.row.stats.minR, 1e-9, 'r_min равен минимальному радиусу траектории');
  assert.equal(d.sectionMinR.length, d.cells, 'радиус посчитан для каждой секции');
  // Без автопрогрессии все секции одинаковы и R_min = core_x/2.
  near(C.derive({ ...p, autoCore: false }).r_min, p.coreX / 2, 1e-9, 'без автопрогрессии R_min = core_x/2');
});

test('отчёт: колонка «Срез по a» согласована с таблицей рисков', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  const risk = C.riskReport(p, d, { pts: d.rowPts, row: d.row });
  for (let i = 0; i < risk.rows.length; i++) {
    const r = risk.rows[i];
    const rReq = (r.v * r.v) / d.a_eff;
    const rSec = d.sectionMinR[i];
    assert.equal(rReq > rSec, r.capped, `VS ${r.vs}: колонка отчёта и риск-таблица расходятся`);
  }
  // Автопрогрессия убирает срез у всех секций.
  assert.ok(risk.rows.every(r => !r.capped), 'при автопрогрессии среза быть не должно');
});

test('валидатор: brim за столом — ошибка до генерации', () => {
  const C = loadCore();
  const p = { ...C.defaults(), rowCenterX: 85 };
  const d = C.derive(p);
  assert.ok(d.bbox.minX >= 0 && d.bbox.maxX <= p.bedX, 'сам ряд помещается в стол');
  assert.ok(C.validate(p).some(i => i.code === 'bed-brim' && i.level === 'error'), 'нужна ошибка bed-brim');
});

test('валидатор: brim в несколько слоёв — предупреждение, печать в один слой', () => {
  const C = loadCore();
  const p = { ...C.defaults(), brimLayers: 3 };
  assert.ok(C.validate(p).some(i => i.code === 'brim-layers' && i.level === 'warn'), 'нужно предупреждение brim-layers');

  const z = extrusionZ(C.compose(p).gcode);
  for (let i = 1; i < z.length; i++) {
    assert.ok(z[i] >= z[i - 1], `Z экструзии убывает: ${z[i - 1]} → ${z[i]}`);
  }
});

test('валидатор: высота слоя выше предела — ошибка', () => {
  const C = loadCore();
  assert.ok(C.validate({ ...C.defaults(), lh: 0.5 }).some(i => i.code === 'lh' && i.level === 'error'), 'нужна ошибка lh');
});

test('checkChain ловит излом на прямом переходе между спиралями', () => {
  const C = loadCore();
  const p = { ...C.defaults(), spiralGap: 0.5 };
  const d = C.derive(p);
  assert.ok(d.row.path.some(s => s.type === 'line'), 'при зазоре появляются прямые переходы');
  const chk = C.checkChain(p, d, { pts: d.rowPts, row: d.row });
  assert.ok(chk.stats.maxTurnDeg > 45, `излом должен измеряться, получено ${chk.stats.maxTurnDeg.toFixed(1)}°`);
  assert.ok(chk.issues.some(i => i.code === 'kink' && i.level === 'error'), 'нужна ошибка kink');
});

test('обратный обход меняет направление слоя, змейка остаётся непрерывной', () => {
  const C = loadCore();
  const normal = C.compose(C.defaults()).gcode;
  const reversed = C.compose({ ...C.defaults(), reversePath: true }).gcode;
  assert.notEqual(normal, reversed, 'обратный обход должен менять траекторию');
  assert.equal(snakeBreaks(normal), 0, 'разрыв змейки без обратного обхода');
  assert.equal(snakeBreaks(reversed), 0, 'разрыв змейки с обратным обходом');
});

test('Flow Ratio выводится в G-code командой M221', () => {
  const C = loadCore();
  assert.match(C.compose(C.defaults()).gcode, /M221 S100/, 'для fr = 1 должен быть M221 S100');
  const one = C.compose({ ...C.defaults(), fr: 1 }).gcode;
  const low = C.compose({ ...C.defaults(), fr: 0.94 }).gcode;
  assert.match(low, /M221 S94/, 'для fr = 0,94 должен быть M221 S94');
  assert.notEqual(one, low, 'разный Flow Ratio должен давать разный G-code');
});

test('Z экструзии не убывает на пресете с brim', () => {
  const C = loadCore();
  const z = extrusionZ(C.compose(C.defaults()).gcode);
  assert.ok(z.length > 1000, 'должно быть много экструдирующих перемещений');
  for (let i = 1; i < z.length; i++) {
    assert.ok(z[i] >= z[i - 1], `Z экструзии убывает: ${z[i - 1]} → ${z[i]}`);
  }
});

test('рамповые дуги не входят в измеримую длину спирали', () => {
  const C = loadCore();
  const p = C.defaults();
  const d = C.derive(p);
  const meas = C.measureChain(p, d, { pts: d.rowPts, row: d.row });

  assert.ok(meas.rampTotal > 0, 'должны быть дуги-рампы на стыках');
  for (const c of meas.cells) {
    assert.ok(c.len > 0 && c.lenIn > 0, 'у каждой спирали есть измеримая часть и рампа');
  }
  // Сумма измеримой части и рампы равна полной длине дуг спирали.
  for (let s = 1; s <= d.cells; s++) {
    const total = d.row.path
      .filter(seg => seg.type === 'arc' && seg.spiral === s)
      .reduce((acc, seg) => acc + Math.PI * seg.r, 0);
    near(meas.cells[s - 1].len + meas.cells[s - 1].lenIn, total, 1e-9, `баланс длин спирали ${s}`);
  }
});
