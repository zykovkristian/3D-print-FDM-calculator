# Отказ от ответственности (Disclaimer)

## Кратко

Проект предоставляется «как есть» (as is), без каких-либо явных или подразумеваемых гарантий, включая гарантии безопасности, совместимости, пригодности для конкретной цели и отсутствия ошибок. Автор не несёт ответственности за любой ущерб, возникший в результате использования проекта, в том числе за повреждение принтера, сопла, стола, хотэнда, электроники, пожар, травмы, финансовые потери или иные последствия.

## Что именно генерирует проект

1. Калькулятор пределов (`tools/filament_test_protocol.html`) выдаёт расчётные значения: пределы скорости по высоте слоя, действующий ограничитель, чувствительность параметров и рекомендации для Bambu Studio. Это расчётная модель, а не готовый профиль печати.
2. Генератор матрицы MVS (`index.html`) формирует G-code: дуги G2/G3, подачу по кривизне, экструзию, температуры, обдув. Этот G-code напрямую управляет нагревом, движением и подачей материала принтера.

## Обязанности пользователя

1. Проверить сгенерированный G-code перед отправкой в принтер: совместимость с моделью принтера и прошивкой, потолки температуры и скорости, габариты стола, отсутствие коллизий.
2. Не превышать рекомендованные производителем принтера температуры, скорости и ускорения.
3. При первом запуске нового G-code оставаться рядом с принтером и держать руку на выключателе питания. Не оставлять принтер без присмотра во время проверочных печатей.
4. Проверять результаты расчётов на своём оборудовании: модель упрощена и показывает тенденции и порядок величин; часть параметров остаётся оценками до измерения.
5. Не использовать проект в коммерческих целях без письменной лицензии (см. `LICENSE` и `COMMERCIAL-LICENSE.md`).

## Analogues in similar projects

Аналогичные отказы от ответственности встречаются в проектах, генерирующих или изменяющих G-code: bambu-p2s-optimized («USE AT YOUR OWN RISK»), bambox («Experimental software — use at your own risk»), estampo («does not verify that settings are safe... Use at your own risk»), gcode2zaxe («Use at your own risk. I take no responsibility for any damage to your printer»), PrusaSlicerPressureAdvanceCalibration («Use at your own risk. No warranty is implied or given»). Настоящий отказ от ответственности составлен в том же духе.

## English

The project is provided "as is", without warranty of any kind, express or implied, including but not limited to warranties of safety, compatibility, fitness for a particular purpose, and non-infringement. The author assumes no liability for any damage to the printer, nozzle, bed, hotend, electronics, fire, injury, financial loss, or any other consequence arising from the use of the project, including generated G-code and recommended settings. Generated G-code controls heating, motion, and extrusion; the user must verify it against their printer model, firmware, and limits before use. Stay near the printer during first runs. Use at your own risk.
