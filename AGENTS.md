# 3D-print-FDM-calculator — указатель

Проект: интерактивный калькулятор пределов FDM-печати — что ограничивает скорость и качество и какие настройки дать в Bambu Studio. Один `index.html`, vanilla JS + SVG, без сборки и бэкенда.

Порядок чтения:
1. Правила процесса — глобальный слой (`C:\Users\Christian\.config\kilo\AGENTS.md`, `rules/core.md`), загружаются автоматически.
2. Профиль проекта — `context.md`: цель, состояние, стек, запреты, команды, решения, что осталось, границы.
3. Журнал прошлой сессии — `docs/session-log.md` (лог, не документ).

Документ за что отвечает:
- `context.md` — единственный авторитет состояния и решений проекта.
- `docs/design-notes.md` — допущения модели, источники данных, правила протокола и открытые вопросы.
- `docs/research/temperature-flow-matrix.md` — ресёрч: сценарий матрицы T × Q, предельные значения, расхождения с текущим протоколом.
- `docs/research/calibration-research.md` — ресёрч: методики и порядок калибровки у Orca/Ellis/Teaching Tech, критика пайплайнов слайсеров.
- `docs/research/parameter-testing-methods-research.md` — ресёрч: DoE-логика тестирования, научная критика методов, противоречия между источниками.
- `docs/research/speed-limit-analysis.md` — что в границах скорости считается, а что измеряется; кинематика и расчёт v_max(h).
- `docs/test-protocol.md` — протокол тестов: порядок, алгоритмы, поля ввода, корректировка после теста.
- `docs/mvs/mvs-matrix-geometry.md` — геометрия траектории матрицы MVS: ядро ряда спиралей (дуги-полуокружности, S-петля в центре), печать G2/G3, послойная сборка, проверки.
- `docs/mvs/mvs-matrix-risks.md` — анализ рисков матрицы MVS: пороги плавности, механики по каждому VS, температурные границы, пределы принтера, пограничные значения.
- `docs/plans/plan-vs-scaled-diameters.md` — прогрессивный диаметр секций по VS (реализовано как опция «Автопрогрессия диаметра» в генераторе): как снимается срез F без выхода за стол, цена для объективности сравнения и контрольные опыты. Схема: `docs/generated/plan-vs-scaled-diameters.svg` (строится `tools/stand-vs-diameters.mjs`).
- `tools/stand-vs-diameters.mjs` — стенд сравнения трёх вариантов прогрессии диаметра (без автопрогрессии / с ней / одинаковый под максимум) с габаритами и радиусами S-петли; `docs/plan-vs-scaled-diameters.svg` — его вывод.
- `tools/spiral-row-builder.html` — исходный генератор ряда спиралей (ядро, перенесённое в `tools/mvs-matrix.html`).
- `tools/stand-centers.mjs` — стенд сравнения центрального участка спирали (hairpin против завитка) с замерами; `docs/generated/stand-centers.svg` — его вывод.
- `tools/check-curl-topology.mjs` — проверка совместимости завитка с бесшовной цепочкой ячеек.
- `tools/compare-turn-variants.mjs` — метрики вариантов разворота (R_min, излом, зазор, длина).
- `tools/spiral-s.mjs` — генератор схемы двойной спирали с S-переходом через центр (по формулам ТЗ): SVG + интерактивный HTML с ползунками и проверки самопересечений, зазора, кривизны.
- `docs/plans/plan-mvs-matrix-generator.md` — план генератора матрицы MVS, написанный до реализации (v1).
- `docs/plans/plan-isolated-tests-logic.md` — план логики изолированных тестов FDM: стресс-тест, матрицы пересечений, закрытие пропусков.
- `README.md` — краткое описание для внешнего читателя.
- `docs/internal/monetization-and-protection.md` — план монетизации и защиты авторства: лицензионная схема, что защищает и что нет, доход, план против копирования, этапы и риски.
- `docs/internal/technology-packaging.md` — варианты упаковки проекта как технологии и рекомендуемая последовательность.
- `docs/project-presentation.md` — презентация проекта (RU); `docs/project-presentation.en.md` — сокращённая версия (EN).
- `docs/internal/publication-plan.md` — порядок подготовки публичного снимка: что исключить, что проверить перед запуском, как опубликовать позже.
- `LICENSE` — PolyForm Noncommercial 1.0.0 (личное и некоммерческое использование бесплатно); `COMMERCIAL-LICENSE.md` — порядок запроса корпоративной лицензии.
- `tools/spiral-row-builder.html` — исходный генератор ряда спиралей (чистая функция без DOM, ядро перенесено в `tools/mvs-matrix.html`).
- `tools/defect-matrix.html` — визуализация матрицы дефектов.
- `tools/mvs-matrix.html` — автономный генератор G-code для матрицы MVS (T × Q): слой одной непрерывной траекторией.
- `docs/archive/MVS_Matrix_Labyrinth_GCode_Generator.html` — первая версия генератора (архив, заменена `tools/mvs-matrix.html`).
- `docs/MVS_dialoge.md` — переписка по разработке матрицы MVS (исходное задание).
- `docs/assets/image1.png`, `docs/assets/image2.png`, `docs/assets/image.png` — референсы формы матрицы (ряд цилиндров, вид сверху двойной спирали).
- `tests/model.test.mjs` — проверки расчётной модели, запуск `node --test`.
- `tests/mvs-matrix.test.mjs` — проверки генератора матрицы MVS, запуск `node --test`.
- `.github/workflows/ci.yml` — CI, тот же прогон на push и pull request.
- `SECURITY.md` — как сообщать об уязвимостях; `.github/ISSUE_TEMPLATE/` — шаблоны обращений; `.github/pull_request_template.md` — чек-лист проверки вклада.

Публичный снимок готовится в ветке `public` (один корневой коммит, внутренние файлы исключены, push не выполнялся) — см. `docs/internal/publication-plan.md`.
