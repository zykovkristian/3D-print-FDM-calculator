# Методы тестирования параметров FDM: научная логика последовательности

Ресёрч открытых источников (2026-11-15). Вопрос: какие есть научно обоснованные
алгоритмы тестирования параметров FDM-печати для характеристики пластика
(катушки), воспроизводимые в домашних условиях, и какова логика
последовательности тестов.

Формат: у каждого тезиса — ссылка, дословный фрагмент, дата. Где подтверждения
нет — сказано прямо.

## 1. Научная база: это семейство планов эксперимента (DoE), а не «тесты»

Тезис: научная методология тестирования параметров — не набор отдельных тестов,
а семейство статистических планов эксперимента (DoE), из которого выбирают план
под задачу.

- Обзор [Drégelyi-Kiss, Hungarian Journal of Industry and Chemistry, 2024-09-08](https://hjic.mk.uni-pannon.hu/index.php/hjic/article/view/1224):
  «Design of Experiments (DoE) is a valuable tool that is efficient, statistically
  rigorous and offers a systematic approach to experimentation. In this article,
  several types of DoE methods such as one-factor-at-a-time (OFAT), full and
  fractional factorial designs, Taguchi, response surface methodology (RSM) and
  descriptive screening designs (DSD) are briefly described in addition to some
  single- and multi-objective optimization methods.»
- Там же перечислены и методы оптимизации: «The optimization methods apply
  utility theory (UT), Taguchi and desirability optimization as well as some
  non-conventional, artificial intelligence-based multi-objective optimization
  methods».

Тезис: наиболее известный план — полный факторный (FFD), число опытов растёт как
произведение уровней факторов; Taguchi сокращает число опытов ортогональными
массивами, но видит только главные эффекты и ограниченные взаимодействия.

- [Panico et al., Scientific Reports 15:16753, 2025-05-14](https://www.nature.com/articles/s41598-025-01016-z):
  «The most known is the Full Factorial Design (FFD), which is based on a
  factorial plan defined by the number of factors and levels.» и
  «Other works adopt the systematic approach provided by Taguchi's method to set
  up a simplified experimental plan in an efficient and effective way via a
  highly fractionated factorial design and orthogonal arrays, although allowing
  to evaluate main effects and only limited interaction effects among considered
  parameters.»

## 2. Логика последовательности (это и есть «алгоритм»)

Сводная логика, которую источники описывают сходно: **отбор факторов →
ранжирование → модель отклика → оптимизация → подтверждающий опыт**. Порядок
именно такой, потому что на каждом шаге нужен результат предыдущего.

1. **Отбор значимых факторов** — «screening» малым числом опытов.
   - [PMC12300564, Ekşi & Karakaya, Polymers 2025, 17(14):1934, 2025-07-14](https://pmc.ncbi.nlm.nih.gov/articles/PMC12300564/):
     «A Taguchi L9 orthogonal array was employed to design the experiments
     efficiently, enabling the systematic evaluation of parameter effects with
     fewer tests.»
   - [Drégelyi-Kiss, 2024](https://hjic.mk.uni-pannon.hu/index.php/hjic/article/view/1224):
     «the main goal of parameter screening».
2. **Ранжирование по вкладу** — S/N-отношение и ANOVA дают проценты вклада.
   - [PMC12300564, 2025-07-14](https://pmc.ncbi.nlm.nih.gov/articles/PMC12300564/):
     «the most influential parameter for the tensile strength is the infill
     percentage, with a contribution of 67.77%, the layer thickness is second
     with 11.52%, the layer width is third with 3.88%, and the print speed is
     last with 0.03%.»
3. **Модель отклика** — после отбора значимых факторов строят поверхность отклика
   или регрессию (кривизна и взаимодействия).
   - [Panico et al., 2025-05-14](https://www.nature.com/articles/s41598-025-01016-z):
     «The first step ... consists in an exploration of the influence of the
     factors' levels ... this is performed via ANOVA approach.» и «After this
     analysis, the next step involves performing a statistical regression to
     predict values for data varying continuously within the defined range.» и
     «the Response Surface Methodology (RSM) is employed to explore and optimize
     complex relationships between input variables and output responses by
     fitting experiments data with mathematical models».
4. **Оптимизация** — по модели ищут оптимум, в т.ч. многокритериальный.
   - [Panico et al., 2025-05-14](https://www.nature.com/articles/s41598-025-01016-z):
     «a Genetic Algorithm (NSGA-II) is integrated to estimate the optimal
     parameter set for multiple responses.»
5. **Подтверждающий опыт** — печатают по найденным параметрам и сверяют с
   предсказанием.
   - [Panico et al., 2025-05-14](https://www.nature.com/articles/s41598-025-01016-z):
     «Testing of a set of specimens printed with the found optimal parameters
     confirm the model's prediction.»
6. **Рандомизация порядка и повторы** — против дрейфа условий.
   - [Panico et al., 2025-05-14](https://www.nature.com/articles/s41598-025-01016-z):
     «Runs are 3D-printed in random order» и «four specimens are printed for each
     run to evaluate a mean value in responses and, from a different perspective,
     the printer repeatability.»

## 3. Что именно измеряют (референсы отклика)

Тезис: в научных работах «качество» заменяют измеримым числом; самый частый
отклик — прочность при растяжении по стандартному образцу, а не «выбрать
покрaсивее».

- [Panico et al., 2025-05-14](https://www.nature.com/articles/s41598-025-01016-z):
  «tensile specimens with standard geometry 1BA according to UNI-ISO 527 are
  fabricated via FDM technology» и «The evaluated responses, derived from
  standard tensile tests, concern the Ultimate Tensile Strength (UTS), elastic
  modulus (E), and strain at maximum stress».
- [PMC12300564, 2025-07-14](https://pmc.ncbi.nlm.nih.gov/articles/PMC12300564/):
  «The specimen geometry complied with the ISO 527-2 standard.» и «Tensile
  testing was performed using a Shimadzu universal testing machine with a 10 kN
  load capacity at a constant crosshead speed of 2 mm/min.»

Тезис: отклик можно брать не только механический — геометрию линии (ширину
экструдата) измеряют объективно, в т.ч. камерой телефона.

- [arXiv:2512.24905, Lin et al. (ETH Zürich), 2025-12-31](https://arxiv.org/html/2512.24905):
  «the line width is approximately proportional to the velocity ratio:
  w(x)=α·ζ(x)» и цель — «A robust, hardware-minimal phone-camera measurement
  method for sub-millimetre bead-width estimation».

## 4. Воспроизводимость в домашних условиях

Тезис: часть работ выполнена на настольных принтерах и воспроизводима дома; но
механическую проверку (растяжение) дома заменить нечем — это ограничение прямо.

- Настольный принтер как стенд:
  [PMC12300564, 2025-07-14](https://pmc.ncbi.nlm.nih.gov/articles/PMC12300564/):
  «A Creality K1 3D printer (Shenzhen, China) was employed» и «The experiments
  were repeated 3 times.»
- Минимум железа (принтер + телефон):
  [arXiv:2512.24905, 2025-12-31](https://arxiv.org/html/2512.24905):
  «Experiments were conducted on an Ender-3 V2 3D printer equipped with a
  0.4 mm diameter nozzle.» и «using only standard 3D printers and a phone
  camera, without requiring additional complex setup».
- Ограничение «дома»: стандартный образец ISO 527-2 физически требует
  разрывной машины; в домашних условиях воспроизводимы геометрические и
  массовые отклики, а не предел прочности. Прямого источника «как заменить
  растяжение дома» не нашлось (см. §7).

## 5. Научная критика «попсовых» методов

Тезис: сообщество-методы (pressure advance / linear advance, «подбор на глаз»)
научно описаны как трудоёмкий перебор без модели процессов.

- [arXiv:2512.24905, 2025-12-31](https://arxiv.org/html/2512.24905):
  «A widely adopted method in the 3D printing community is pressure advance (or
  linear advance), which adjusts the extrusion command based on an experimentally
  determined gain» и далее «While these techniques are easy to implement and
  effective in practice, they rely on time-consuming trial-and-error experimental
  tuning and lack a deep understanding of the coupled dynamics between extrusion
  and motion, leading to limited accuracy and generalizability».
- Там же про общий дефицит домашних методов:
  «Existing methods require specialized hardware, extensive calibration, or
  firmware modifications that are inaccessible to most users.»

## 6. Противоречия между источниками

- **Температура.** [Panico et al., 2025-05-14](https://www.nature.com/articles/s41598-025-01016-z):
  температура статистически незначима сама по себе для деформации — «except from
  the factor "Temperature" on response εd, meaning no significant difference
  between the considered levels». Против
  [PMC9619022, Sandanamsamy et al., Prog Addit Manuf, 2022-10-31](https://pmc.ncbi.nlm.nih.gov/articles/PMC9619022/):
  «A typical upper-temperature limitation for 3D printing polymer materials is
  240 °C. The polymer suffered degradation when the nozzle temperature exceeded
  this limit.»
- **Высота слоя.** Внутри [PMC12300564, 2025-07-14](https://pmc.ncbi.nlm.nih.gov/articles/PMC12300564/)
  есть обе стороны: максимальная прочность получена при 0.4 мм (толстый слой) и
  100 % заполнении, но тут же «thinner layers (0.2 mm) result in higher tensile
  strength, likely due to better interlayer adhesion».
- **Скорость.** [PMC12300564, 2025-07-14](https://pmc.ncbi.nlm.nih.gov/articles/PMC12300564/):
  «The influence of print speed on both the tensile strength and elongation
  responses was minimal» (вклад 0.03 %). Против
  [Panico et al., 2025-05-14](https://www.nature.com/articles/s41598-025-01016-z):
  низкая скорость 10 мм/с максимизирует UTS и E. Расхождение объяснимо: отклик
  разный (прочность против геометрии/качества), диапазоны скорости разные.

## 7. Осталось неподтверждённым

- **Канонического «протокола последовательности тестов катушки» в рецензируемой
  литературе нет.** Найденные работы оптимизируют параметры для известного
  материала и детали, а не характеризуют неизвестную катушку от начала до
  конца. Прямого научного «алгоритма для тестирования пластика» не нашлось.
- **«Температурная башня»** как метод: рецензируемого подтверждения (валидности
  или опровержения) не найдено. Поисковики упирались в ботовые проверки.
- **Классический «single-wall cube / extrusion multiplier»**: научной
  валидации измерения не найдено; научная замена — измерение ширины линии
  камерой ([arXiv:2512.24905](https://arxiv.org/html/2512.24905)), но это не
  тот же тест.
- **Замена разрывной машины «дома»**: подтверждённого научного способа
  получить предел прочности без тензометра не найдено.
- **Порядок тестов** (что раньше — температура или поток) в научных DoE-работах
  не обсуждается: план строится как единый массив, а не как пошаговый гайд.

## 8. Что из этого применимо к проекту

- Взять из литературы: отклик — число, а не «на глаз»; план — ортогональный
  массив L9 или DSD для отбора, затем RSM; повторы ≥3 и рандомизация; в конце
  подтверждающий опыт.
- Домашний минимум: ширина линии камерой телефона, масса/габарит калипером,
  малый L9-план на настольной машине.
- Отличие от проекта: калькулятор строит пошаговый протокол (температура →
  поток → …), а наука — единый факторный план. Это разные задачи: протокол
  характеризации vs оптимизация; прямое перенесение порядка из статей
  невозможно.

## Источники (открытые)

1. Panico A., Corvi A., Collini L., Sciancalepore C. Multi objective optimization
   of FDM 3D printing parameters set via design of experiments and machine
   learning algorithms. Scientific Reports 15:16753. 2025-05-14.
   https://www.nature.com/articles/s41598-025-01016-z
2. Ekşi S., Karakaya C. Effects of Process Parameters on Tensile Properties of
   3D-Printed PLA Parts Fabricated with the FDM Method. Polymers 2025, 17(14):1934.
   2025-07-14. https://pmc.ncbi.nlm.nih.gov/articles/PMC12300564/
3. Sandanamsamy L. et al. A comprehensive review on fused deposition modelling of
   polylactic acid. Progress in Additive Manufacturing. 2022-10-31.
   https://pmc.ncbi.nlm.nih.gov/articles/PMC9619022/
4. Drégelyi-Kiss Á. Application of Experimental Design-Based Predictive Models and
   Optimization in Additive Manufacturing – a Review. Hungarian Journal of Industry
   and Chemistry 52(1):55-70. 2024-09-08.
   https://hjic.mk.uni-pannon.hu/index.php/hjic/article/view/1224
5. Lin Y., Guidetti X., Nagel Y., Balta E.C., Lygeros J. One-Shot Camera-Based
   Extrusion Optimization for High Speed Fused Filament Fabrication. arXiv:2512.24905.
   2025-12-31. https://arxiv.org/html/2512.24905
