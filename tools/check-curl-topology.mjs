// Проверка совместимости «завитка» (топология референса) с бесшовной цепочкой.
//
// Топология референса: путь спирали входит в центр, обходит вокруг оси
// примерно на 270° и выходит второй ветвью; ветви разнесены в центре дальше,
// чем в основной части спирали (каналы у центра шире).
//
// Вопрос: можно ли при этом сохранить (а) непрерывную экструзию,
// (б) прямую внутреннюю общую касательную как переход между цилиндрами,
// (в) равномерный шаг в основной части спирали.

const D2R = Math.PI / 180;

// --- Геометрия завитка в локальном фрейме ячейки ---
// Вход ветви A: точка P0 = rA·u(thA), касательная = ccw-перпендикуляр u(thA).
// Завиток: дуга радиуса Rt с центром C = (rA - Rt)·u(thA) (центр на
// радиальной линии — так касательная входит гладко), охват beta.
// Выход: P1 = C + Rt·u(thA + beta), касательная = ccw-перпендикуляр (P1 - C).

function curl(rA, thA, Rt, beta) {
  const uX = Math.cos(thA), uY = Math.sin(thA);
  const wX = -uY, wY = uX;
  const cX = (rA - Rt) * uX, cY = (rA - Rt) * uY;
  const pts = [];
  const n = 240;
  for (let i = 0; i <= n; i++) {
    const phi = beta * i / n;
    const cs = Math.cos(phi), sn = Math.sin(phi);
    pts.push({ x: cX + Rt * (cs * uX + sn * wX), y: cY + Rt * (cs * uY + sn * wY) });
  }
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const dir = { x: last.x - prev.x, y: last.y - prev.y };
  const L = Math.hypot(dir.x, dir.y);
  return { pts, exit: last, dir: { x: dir.x / L, y: dir.y / L } };
}

// --- Проверка 1: меняется ли знак касательной (смысл обхода) ---
function curlSense(rA, Rt, beta) {
  const c = curl(rA, 0, Rt, beta);
  const d0 = c.dir;
  // касательная на входе: ccw-перпендикуляр u(0) = (0,1)
  const inDir = { x: 0, y: 1 };
  const cross = inDir.x * d0.y - inDir.y * d0.x;   // >0 — поворот против часовой
  return { turnDeg: Math.acos(Math.max(-1, Math.min(1, inDir.x * d0.x + inDir.y * d0.y))) / D2R, cross };
}

// --- Проверка 2: сохраняется ли бесшовный стык ячеек ---
// Вход ячейки: точка (R_out, th0), касательная = ccw-перпендикуляр u(th0).
// Выход ячейки: точка (R_out, th0 + PI), касательная должна совпасть со входной.
// Для этого замыкающая дуга (внешняя граница) идёт по часовой стрелке:
// её касательная на выходе = cw-перпендикуляр u(th0+PI) = ccw-перпендикуляр u(th0). OK.

const R_out = 10.1886, r_min = 5.98, g = 1.2;
const th0 = 211.34 * D2R;

console.log('Проверка завитка (rA = 5.98 мм, Rt = 2 мм):\n');
for (const beta of [180, 270, 360, 450]) {
  const c = curl(r_min, 0, 2.0, beta * D2R);
  const s = curlSense(r_min, 2.0, beta * D2R);
  const rExit = Math.hypot(c.exit.x, c.exit.y);
  console.log(`  охват ${String(beta).padStart(3)}°: поворот касательной ${s.turnDeg.toFixed(0).padStart(3)}°, ` +
    `знак ${s.cross > 0 ? '+' : '-'} (смена направления обхода), радиус выхода ${rExit.toFixed(2)} мм`);
}

console.log('\nЧто это значит для цепочки:');
console.log('  * смена направления обхода происходит на завитке (поворот касательной ~180°),');
console.log('    поэтому ветвь B выходит спиралью против часовой стрелки — как и в текущей схеме;');
console.log('  * значит замыкающая дуга остаётся по часовой стрелке, а вход и выход ячейки —');
console.log('    на прежних местах (R_out, th0) и (R_out, th0 + 180°):');
console.log('    => переход между цилиндрами остаётся прямой общей касательной, цепочка бесшовна;');
console.log('  * цена: в центре ветви разнесены на 2*Rt (4 мм вместо g = 1.2 мм), значит');
console.log('    каналы у центра шире, чем в основной части спирали (это видно и на референсе);');
console.log('    шаг должен переходить от 2*Rt к g плавно, без пересечения ветвей.');

console.log('\nКинематика завитка:');
for (const Rt of [1.2, 2, 3]) {
  const vmax = 218.8;
  console.log(`  Rt = ${Rt} мм => предел скорости в центре sqrt(a*Rt) = ${Math.sqrt(8000 * Rt).toFixed(0)} мм/с ` +
    `(нужно ${vmax.toFixed(0)} мм/с => ${Math.sqrt(8000 * Rt) >= vmax ? 'проходит' : 'срез F'})`);
}
