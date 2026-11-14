import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const MARKER = '/* ============ ИНТЕРФЕЙС ============ */';

function loadModel() {
  const cut = html.indexOf(MARKER);
  assert.ok(cut > 0, 'в index.html не найден маркер интерфейса');
  const start = html.indexOf('<script>');
  assert.ok(start > 0, 'в index.html не найден тег <script>');
  const ctx = { module: { exports: {} } };
  vm.createContext(ctx);
  vm.runInContext(html.slice(start + '<script>'.length, cut), ctx, { filename: 'index.model.js' });
  return ctx.module.exports;
}

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ожидалось ${b} ± ${eps}, получено ${a}`);

const M = loadModel();

test('модель экспортирует функции и справочник пластиков', () => {
  for (const fn of ['defaults', 'solve', 'mvsT', 'qLimits', 'vAtT', 'aLine']) {
    assert.equal(typeof M[fn], 'function', `нет функции ${fn}`);
  }
  assert.ok(M.PLASTICS && Object.keys(M.PLASTICS).length > 0, 'PLASTICS пуст');
});

test('эталон PLA Lite, слой 0,20 мм: ограничитель — поток', () => {
  const R = M.solve(M.defaults(), 0.2);
  near(R.vIn, 276.135, 0.5, 'v_внутр');
  near(R.Q, 20.825, 0.05, 'Q_max');
  assert.equal(R.T, 230, 'T_print');
  assert.equal(R.lim, 'flow', 'ограничитель');
  near(R.FR, 0.98, 1e-9, 'Flow Ratio');
});

test('эталон: тонкий слой 0,08 мм ограничен охлаждением', () => {
  assert.equal(M.solve(M.defaults(), 0.08).lim, 'cool', 'ограничитель');
});

test('MVS растёт с температурой', () => {
  const P = M.defaults();
  near(M.mvsT(P, 215), 20, 1e-9, 'mvsT(215)');
  near(M.mvsT(P, 230), 24.5, 1e-9, 'mvsT(230)');
  assert.ok(M.mvsT(P, 230) > M.mvsT(P, 215), 'MVS должна расти с температурой');
});

test('экструдат: окно T_min..T_max и T_opt по чистому потоку', () => {
  // Q 4/8/12. T=200: на Q=4 и 8 недоплав (break) → чистой нити нет.
  // T=210, 220: чисто на Q=4 и 8, Q=12 недоплав. T=230: на Q=4 пузыри (деградация).
  const d = [0.40, 0.41, 0.40];
  const rows = [
    { T: 200, Q: 4, d, def: 'break' }, { T: 200, Q: 8, d, def: 'break' }, { T: 200, Q: 12, d, def: 'break' },
    { T: 210, Q: 4, d, def: 'none' }, { T: 210, Q: 8, d, def: 'none' }, { T: 210, Q: 12, d, def: 'break' },
    { T: 220, Q: 4, d, def: 'none' }, { T: 220, Q: 8, d, def: 'none' }, { T: 220, Q: 12, d, def: 'break' },
    { T: 230, Q: 4, d, def: 'bubble' }, { T: 230, Q: 8, d, def: 'none' }, { T: 230, Q: 12, d, def: 'none' }
  ];
  const R = M.analyzeStrands(rows, { cvMax: 5, nozzle: 0.4 });
  assert.equal(R.outs.tMin, 210, 'T_min: первая T с чистой нитью');
  assert.equal(R.outs.tMax, 220, 'T_max: последняя T перед деградацией (деградация на Q=4 при 230)');
  assert.equal(R.outs.tOpt, 210, 'T_opt: самая низкая T с наибольшим чистым потоком (при 210 и 220 чистый Q=8)');
});

test('экструдат: нестабильная нить (CV выше порога) не считается чистой', () => {
  const rows = [
    { T: 210, Q: 4, d: [0.40, 0.40, 0.40], def: 'none' },
    { T: 210, Q: 8, d: [0.30, 0.42, 0.50], def: 'none' },
    { T: 220, Q: 4, d: [0.40, 0.40, 0.40], def: 'none' },
    { T: 220, Q: 8, d: [0.40, 0.40, 0.40], def: 'none' },
    { T: 230, Q: 4, d: [0.40, 0.40, 0.40], def: 'bubble' }
  ];
  const R = M.analyzeStrands(rows, { cvMax: 5 });
  assert.equal(R.outs.tOpt, 220, 'при T=210 нить на Q=8 нестабильна, T_opt — 220');
  assert.equal(R.outs.tMax, 220, 'деградация на Q=4 при 230 → T_max 220');
});

test('экструдат: мало замеров — null, а не выдуманный результат', () => {
  assert.equal(M.analyzeStrands([{ T: 210, Q: 4, d: [0.4], def: 'none' }]), null, 'одного замера диаметра недостаточно');
});

test('экструдат: деградация уже на первой T — выход без выводов', () => {
  const d = [0.4, 0.4], rows = [];
  for (const T of [200, 210]) for (const Q of [4, 8]) rows.push({ T, Q, d, def: 'bubble' });
  const R = M.analyzeStrands(rows, {});
  assert.equal(Object.keys(R.outs).length, 0, 'параметры не выводятся');
  assert.ok(R.warn.length > 0, 'есть предупреждение');
});

test('экструдат: одна температура или один поток — не окно, а null', () => {
  const d = [0.4, 0.41];
  const one = [{ T: 210, Q: 4, d, def: 'none' }, { T: 210, Q: 8, d, def: 'none' }];
  assert.equal(M.analyzeStrands(one, {}), null, 'по одной температуре окно не определить');
});

test('таблица Bambu Studio: порядок Flow Ratio → PA → MVS', () => {
  const i = html.indexOf('function bambuRows');
  assert.ok(i > 0, 'bambuRows не найдена');
  const body = html.slice(i, html.indexOf('\n}', i));
  const fr = body.indexOf("'Flow Ratio'");
  const pa = body.indexOf('Pressure Advance');
  const mvs = body.indexOf('Максимальная объемная скорость');
  assert.ok(fr > 0 && pa > 0 && mvs > 0, 'строки таблицы не найдены');
  assert.ok(fr < pa && pa < mvs, 'порядок должен быть Flow Ratio → PA → MVS');
});
