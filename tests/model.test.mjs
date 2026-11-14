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
