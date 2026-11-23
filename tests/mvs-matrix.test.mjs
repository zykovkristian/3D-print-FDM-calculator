import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const MARKER = '/* ============ ИНТЕРФЕЙС ============ */';

function loadCore() {
  const cut = html.indexOf(MARKER);
  assert.ok(cut > 0, 'в index.html не найден маркер интерфейса');
  const start = html.indexOf('<script>');
  assert.ok(start > 0, 'в index.html не найден тег <script>');
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
  const p = { ...C.defaults(), brimOn: true, raftOn: false, rowCenterX: 85 };
  const d = C.derive(p);
  assert.ok(d.bbox.minX >= 0 && d.bbox.maxX <= p.bedX, 'сам ряд помещается в стол');
  assert.ok(C.validate(p).some(i => i.code === 'bed-brim' && i.level === 'error'), 'нужна ошибка bed-brim');
});

test('валидатор: brim в несколько слоёв — поддержан, без предупреждения', () => {
  const C = loadCore();
  const p = { ...C.defaults(), brimOn: true, raftOn: false, brimLayers: 3 };
  assert.ok(!C.validate(p).some(i => i.code === 'brim-layers'), 'предупреждения brim-layers больше не должно быть');
  // Brim печатается в 3 слоя: G-code содержит Z = 0.2, 0.4, 0.6 в brim-секции.
  const { gcode } = C.compose(p);
  const z = extrusionZ(gcode);
  const brimZs = new Set(z.map(v => Math.round(v * 10)));
  assert.ok(brimZs.has(2) && brimZs.has(4) && brimZs.has(6), 'brim должен содержать 3 слоя');
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
  const normal = C.compose({ ...C.defaults(), reversePath: false }).gcode;
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
  const gcode = C.compose({ ...C.defaults(), brimOn: true, raftOn: false }).gcode;
  // Brim печатается в несколько слоёв (Z растёт): проверяем монотонность brim.
  const lines = gcode.split('\n');
  let brimStart = 0, brimEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/; --- BRIM ---/.test(lines[i])) brimStart = i;
    if (brimStart > 0 && /; ===/.test(lines[i]) && i > brimStart) { brimEnd = i; break; }
  }
  const brimGcode = lines.slice(brimStart, brimEnd).join('\n');
  const brimZ = extrusionZ(brimGcode);
  for (let i = 1; i < brimZ.length; i++) {
    assert.ok(brimZ[i] >= brimZ[i - 1], `Z brim убывает: ${brimZ[i - 1]} → ${brimZ[i]}`);
  }
  // Основная печать: монотонность после маркера первого слоя.
  let mainStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/; LAYER 1:/.test(lines[i])) { mainStart = i; break; }
  }
  const mainGcode = lines.slice(mainStart).join('\n');
  const z = extrusionZ(mainGcode);
  assert.ok(z.length > 1000, 'должно быть много экструдирующих перемещений');
  for (let i = 1; i < z.length; i++) {
    assert.ok(z[i] >= z[i - 1], `Z экструзии убывает: ${z[i - 1]} → ${z[i]}`);
  }
});

test('температуры по умолчанию: горячая зона снизу', () => {
  const C = loadCore();
  const d = C.derive(C.defaults());
  assert.deepEqual(Array.from(d.ts), [220, 210, 200, 190], 'по умолчанию снизу горячая зона');
});

test('tempHotBottom: выключенная опция даёт холодную зону снизу', () => {
  const C = loadCore();
  const d = C.derive({ ...C.defaults(), tempHotBottom: false });
  assert.deepEqual(Array.from(d.ts), [190, 200, 210, 220], 'при выключенной опции снизу холодная зона');
});

test('tempHotBottom: инверсия меняет только порядок, не набор температур', () => {
  const C = loadCore();
  const hot = C.derive({ ...C.defaults(), tempHotBottom: true });
  const cold = C.derive({ ...C.defaults(), tempHotBottom: false });
  assert.deepEqual(Array.from(hot.ts).slice().sort((a, b) => a - b), Array.from(cold.ts).slice().sort((a, b) => a - b));
});

test('fan=0: команда M106 с ненулевым обдувом отсутствует в G-code', () => {
  const C = loadCore();
  const { gcode } = C.compose({ ...C.defaults(), fan: 0 });
  // M106 P1 S0 в конце (выключение вентилятора) допустим, но ненулевой обдув — нет.
  assert.ok(!/M106\s+P1\s+S[1-9]/.test(gcode), 'при fan=0 не должно быть M106 с ненулевым S');
});

test('fan=50: команда M106 присутствует в G-code', () => {
  const C = loadCore();
  const { gcode } = C.compose({ ...C.defaults(), fan: 50 });
  assert.ok(/^M106\b/m.test(gcode), 'при fan>0 команда M106 должна генерироваться');
});

test('brimLayers=3: brim печатается в 3 слоя (Z растёт)', () => {
  const C = loadCore();
  const { gcode } = C.compose({ ...C.defaults(), brimOn: true, raftOn: false, brimLayers: 3 });
  const z = extrusionZ(gcode);
  const brimZs = new Set(z.map(v => Math.round(v * 10)));
  assert.ok(brimZs.has(2), 'brim должен содержать Z = 0.2 мм');
  assert.ok(brimZs.has(4), 'brim должен содержать Z = 0.4 мм');
  assert.ok(brimZs.has(6), 'brim должен содержать Z = 0.6 мм');
});

test('raft: заливка идёт по форме объединения спиралей с отступом, а не по прямоугольнику', () => {
  const C = loadCore();
  const p = { ...C.defaults(), brimOn: false, raftOn: true, raftLayers: 2, raftGap: 1.5, raftFirstExpansion: 2 };
  const { gcode } = C.compose(p);
  assert.ok(gcode.includes('--- RAFT ---'), 'должна быть секция RAFT');
  assert.ok(!gcode.includes('--- BRIM ---'), 'brim не должен генерироваться вместе с raft');

  const d = C.derive(p);
  // Граница плота = объединение окружностей спиралей, увеличенных на отступ.
  // Нижний слой расширен сильнее (gap + raftFirstExpansion), поэтому общий
  // диапазон по X берём от самого расширенного слоя.
  const gap = 1.5 + 2;
  const circles = d.row.spirals.map(q => ({ x: q.center[0], y: q.center[1], r: q.outerR + gap }));
  const expMinX = Math.min(...circles.map(c => c.x - c.r));
  const expMaxX = Math.max(...circles.map(c => c.x + c.r));

  const raftX = [];
  let inRaft = false;
  for (const raw of gcode.split('\n')) {
    const l = raw.trim();
    if (l.includes('--- RAFT ---')) { inRaft = true; continue; }
    if (inRaft && l.startsWith('; LAYER')) break;
    if (inRaft && /^G[01]/.test(l)) {
      const m = l.match(/X([-\d.]+)/);
      if (m) raftX.push(Number(m[1]));
    }
  }
  assert.ok(raftX.length > 20, 'raft должен содержать линии заливки');
  const minX = Math.min(...raftX), maxX = Math.max(...raftX);
  assert.ok(Math.abs(minX - expMinX) < 0.05, `левая граница raft ${minX} ≠ ${expMinX.toFixed(2)}`);
  assert.ok(Math.abs(maxX - expMaxX) < 0.05, `правая граница raft ${maxX} ≠ ${expMaxX.toFixed(2)}`);

  // Плот повторяет форму объединения окружностей: по Y он намного уже
  // прямоугольника той же ширины (края — дуги, а не прямые углы).
  const raftY = [];
  inRaft = false;
  for (const raw of gcode.split('\n')) {
    const l = raw.trim();
    if (l.includes('--- RAFT ---')) { inRaft = true; continue; }
    if (inRaft && l.startsWith('; LAYER')) break;
    if (inRaft && /^G[01]/.test(l)) {
      const m = l.match(/Y([-\d.]+)/);
      if (m) raftY.push(Number(m[1]));
    }
  }
  const raftDepth = Math.max(...raftY) - Math.min(...raftY);
  const rectDepth = (maxX - minX);
  assert.ok(raftDepth < rectDepth * 0.6, `высота плота ${raftDepth.toFixed(1)} слишком близка к прямоугольнику ${rectDepth.toFixed(1)}`);
});

test('raft: структура слоёв — сплошной низ, разреженная середина, сплошной верх', () => {
  const C = loadCore();
  const p = { ...C.defaults(), brimOn: false, raftOn: true, raftLayers: 3, raftBottomLayers: 1, raftTopLayers: 1, raftDensity: 20 };
  const { gcode } = C.compose(p);
  assert.match(gcode, /Raft layer 1\/3 \(solid\)/, 'первый слой плота сплошной');
  assert.match(gcode, /Raft layer 2\/3 \(20%\)/, 'средний слой разреженный');
  assert.match(gcode, /Raft layer 3\/3 \(solid\)/, 'верхний слой сплошной');
});

test('raft: нижний слой расширен сильнее верхних', () => {
  const C = loadCore();
  const p = { ...C.defaults(), brimOn: false, raftOn: true, raftLayers: 3, raftGap: 1.5, raftFirstExpansion: 2 };
  const { gcode } = C.compose(p);
  // Нижний слой — с отступом 3.5 мм (1.5 + 2), верхние — с отступом 1.5 мм.
  const circles = (() => {
    const d = C.derive(p);
    return d.row.spirals.map(q => ({ x: q.center[0], y: q.center[1], r: q.outerR }));
  })();
  const spanAt = (gap, y) => {
    const spans = [];
    for (const c of circles) {
      const r = c.r + gap;
      const dy = y - c.y;
      if (Math.abs(dy) > r) continue;
      const h = Math.sqrt(r * r - dy * dy);
      spans.push([c.x - h, c.x + h]);
    }
    return spans;
  };
  const y = circles[0].y;
  const bottom = spanAt(1.5 + 2, y);
  const top = spanAt(1.5, y);
  assert.ok(bottom[0][0] < top[0][0] - 1.9, 'нижний слой плота должен быть шире верхнего');
});

test('raft: своя скорость и своя температура', () => {
  const C = loadCore();
  const p = { ...C.defaults(), brimOn: false, raftOn: true, raftLayers: 2, raftSpeed: 40, raftTemp: 210 };
  const { gcode } = C.compose(p);
  // 40 мм/с → F2400 (мм/мин)
  assert.match(gcode, /F2400/, 'скорость raft 40 мм/с должна дать F2400');
  // Температура плота 210 °C и возврат к первой зоне после плота
  assert.match(gcode, /M104 S210/, 'должна быть установка температуры плота');
  assert.match(gcode, /M104 S190/, 'после плота — возврат к температуре первой зоны');
});

test('raft: отступ 30 мм не помещается на стол A1 mini — ошибка', () => {
  const C = loadCore();
  const p = { ...C.defaults(), brimOn: false, raftOn: true, raftGap: 30 };
  const issues = C.validate(p);
  assert.ok(issues.some(i => i.code === 'bed-raft' && i.level === 'error'), 'нужна ошибка bed-raft при отступе 30 мм');
});

test('raft: периметр печатается на каждом слое (замкнутый край)', () => {
  const C = loadCore();
  const p = { ...C.defaults(), brimOn: false, raftOn: true, raftLayers: 3 };
  const { gcode } = C.compose(p);
  const per = (gcode.match(/; Raft perimeter/g) || []).length;
  assert.equal(per, 3, `периметр должен быть на каждом из 3 слоёв, найдено ${per}`);
});

test('raft: заливка соседних слоёв идёт перекрестно (±45°)', () => {
  const C = loadCore();
  const p = { ...C.defaults(), brimOn: false, raftOn: true, raftLayers: 3, raftBottomLayers: 2, raftTopLayers: 1 };
  const { gcode } = C.compose(p);

  // Разбор секции RAFT по слоям. Длинные отрезки (> 5 мм) — это линии заливки,
  // короткие — сегменты периметра (дуги).
  const segsByLayer = {};
  let cur = null, x = 0, y = 0;
  for (const raw of gcode.split('\n')) {
    const l = raw.trim();
    if (l.startsWith('; ===') || l.startsWith('; LAYER') || l.startsWith('; ZONE')) { cur = null; continue; }
    const lm = l.match(/^; Raft layer (\d+)\//);
    if (lm) { cur = Number(lm[1]); segsByLayer[cur] = []; continue; }
    const g = l.match(/^G([01])\b X([-\d.]+) Y([-\d.]+)/);
    if (!g) continue;
    const nx = Number(g[2]), ny = Number(g[3]);
    if (g[1] === '1' && cur) {
      if (Math.hypot(nx - x, ny - y) > 5) segsByLayer[cur].push([x, y, nx, ny]);
    }
    x = nx; y = ny;
  }

  // Угол заливки слоя, приведённый к [0; π): усреднение по удвоенному углу.
  const angleOf = segs => {
    let sx = 0, sy = 0;
    for (const s of segs) {
      const a = Math.atan2(s[3] - s[1], s[2] - s[0]);
      sx += Math.cos(2 * a); sy += Math.sin(2 * a);
    }
    return 0.5 * Math.atan2(sy, sx);
  };

  assert.ok(segsByLayer[1] && segsByLayer[1].length > 5, 'в слое 1 должны быть линии заливки');
  assert.ok(segsByLayer[2] && segsByLayer[2].length > 5, 'в слое 2 должны быть линии заливки');
  const a1 = angleOf(segsByLayer[1]), a2 = angleOf(segsByLayer[2]);
  let d = Math.abs(a1 - a2);
  if (d > Math.PI / 2) d = Math.PI - d;
  assert.ok(Math.abs(d - Math.PI / 2) < 0.2,
    `углы заливки соседних слоёв не перекрестны: ${(a1 * 180 / Math.PI).toFixed(1)}° и ${(a2 * 180 / Math.PI).toFixed(1)}°`);
});

test('raft: первый слой медленнее, верхние — заданной скоростью', () => {
  const C = loadCore();
  const p = { ...C.defaults(), brimOn: false, raftOn: true, raftLayers: 2, raftSpeed: 100, raftFirstSpeed: 40 };
  const { gcode } = C.compose(p);
  let cur = null;
  const firstF = new Set(), otherF = new Set();
  for (const raw of gcode.split('\n')) {
    const l = raw.trim();
    if (l.startsWith('; ===')) { cur = null; continue; }
    const lm = l.match(/^; Raft layer (\d+)\//);
    if (lm) { cur = Number(lm[1]); continue; }
    if (!cur || !/^G1\b/.test(l)) continue;
    const fm = l.match(/\bF(\d+)/);
    if (!fm) continue;
    (cur === 1 ? firstF : otherF).add(fm[1]);
  }
  assert.deepEqual([...firstF], ['2400'], `первый слой должен идти только на F2400, есть ${[...firstF]}`);
  assert.ok(otherF.has('6000'), `верхние слои должны идти на F6000, есть ${[...otherF]}`);
});

test('raft: включён по умолчанию, brim — нет', () => {
  const C = loadCore();
  const p = C.defaults();
  assert.equal(p.raftOn, true, 'raft должен быть включён по умолчанию');
  assert.equal(p.brimOn, false, 'brim по умолчанию выключен');
  const { gcode } = C.compose(p);
  assert.ok(gcode.includes('--- RAFT ---'), 'G-code по умолчанию содержит секцию RAFT');
  assert.ok(!gcode.includes('--- BRIM ---'), 'G-code по умолчанию не содержит секцию BRIM');
});

test('AUTO-план: окно каждой точки (VS × T) не короче заданного минимума', () => {
  const C = loadCore();
  const p = { ...C.defaults(), vsMode: 'plan', minPointSec: 60, maxPrintMin: 240 };
  const d = C.derive(p);
  assert.ok(d.plan, 'план должен быть посчитан');
  assert.ok(d.plan.windows.length === d.vs.length, 'окно посчитано для каждой ячейки');
  const worst = Math.min(...d.plan.windows);
  assert.ok(worst >= 59.5, `самое короткое окно ${worst.toFixed(0)} с < 60 с`);
  assert.ok(d.layersPerZone > 1, 'в зоне должно быть больше одного слоя');
  assert.equal(d.plan.layersPerZone, d.layersPerZone, 'число слоёв в зоне из плана используется в расчёте');
  assert.ok(Math.abs(d.plan.band - d.layersPerZone * p.lh) < 1e-6, `высота зоны ${d.plan.band} ≠ ${d.layersPerZone}×${p.lh}`);
});

test('AUTO-план: ряд помещается в стол и время печати в лимите', () => {
  const C = loadCore();
  const p = { ...C.defaults(), vsMode: 'plan', minPointSec: 60, maxPrintMin: 240 };
  const d = C.derive(p);
  assert.ok(d.bbox.minX >= 0 && d.bbox.maxX <= p.bedX, 'ряд по X в столе');
  assert.ok(d.bbox.minY >= 0 && d.bbox.maxY <= p.bedY, 'ряд по Y в столе');
  assert.ok(d.plan.printMin <= 240 * 1.05, `время печати ${d.plan.printMin.toFixed(0)} мин выше лимита`);
});

test('AUTO-план: точка перебора — слои в зоне растут с требованием к окну', () => {
  const C = loadCore();
  const short = C.derive({ ...C.defaults(), vsMode: 'plan', minPointSec: 30, maxPrintMin: 600 });
  const long = C.derive({ ...C.defaults(), vsMode: 'plan', minPointSec: 120, maxPrintMin: 600 });
  assert.ok(long.layersPerZone > short.layersPerZone, 'при большем окне нужно больше слоёв в зоне');
});

test('раскраска карты T: цвет по фактической температуре, не по индексу зоны', () => {
  const C = loadCore();
  const hot = C.derive({ ...C.defaults(), tempHotBottom: true });
  const cold = C.derive({ ...C.defaults(), tempHotBottom: false });
  const hueOf = d => d.ts.map(t => C.tempHue(t, Math.min(...d.ts), Math.max(...d.ts)));

  // Одна и та же температура — один и тот же цвет при любом порядке зон.
  const hHot = hueOf(hot), hCold = hueOf(cold);
  for (const t of hot.ts) {
    assert.equal(C.tempHue(t, 190, 220), C.tempHue(t, 190, 220), 'цвет зависит только от T');
  }
  // Порядок зон инвертирован, а набор цветов по температуре — тот же.
  assert.deepEqual(hHot.slice().sort((a, b) => a - b), hCold.slice().sort((a, b) => a - b));
  // Горячая зона — красная (hue малый), холодная — синяя (hue большой).
  assert.ok(C.tempHue(220, 190, 220) < 40, '220 °C должен быть красным');
  assert.ok(C.tempHue(190, 190, 220) > 180, '190 °C должен быть синим');
});

test('totalHeight учитывает высоту brim', () => {
  const C = loadCore();
  const p = { ...C.defaults(), brimOn: true, raftOn: false, brimLayers: 3 };
  const d = C.derive(p);
  // Brim занимает 3 слоя под моделью, модель начинается на один слой выше.
  const expected = (3 + 1) * p.lh + d.totalLayers * p.lh;
  assert.ok(Math.abs(d.totalHeight - expected) < 1e-6, `totalHeight ${d.totalHeight} ≠ ${expected}`);
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
