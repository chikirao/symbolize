import type { Lang } from '../store/uiStore'

/**
 * What each parameter actually does, in both languages.
 *
 * Keyed on the settings path, which is the one identifier a control already
 * carries — a label can be reworded, a path cannot without the engine noticing.
 * Zone parameters are stored per zone (`zone.list.0.sizeScale`) but read the
 * same for all three, so the lookup collapses the index: one entry under
 * `zone.sizeScale` serves Z1, Z2 and Z3.
 *
 * A path with no entry simply has no hover description. That is the safe
 * failure mode — nothing breaks, nothing is invented, and the gap is visible
 * to whoever adds the next parameter.
 */
export interface ParamDoc {
  en: string
  ru: string
}

export const PARAM_DOCS: Record<string, ParamDoc> = {
  /* ---------------- source ---------------- */
  'source.mode': {
    en: 'Which channel of the photo drives everything: brightness, the alpha channel, or the two multiplied together.',
    ru: 'Какой канал фотографии всем управляет: яркость, альфа-канал или их произведение.',
  },
  'source.invert': {
    en: 'Swaps light and dark before anything else reads the image. Dark subjects on a light background usually want this on.',
    ru: 'Меняет местами светлое и тёмное до того, как картинку прочитают остальные шаги. Тёмный объект на светлом фоне обычно просит это включить.',
  },
  'source.brightness': {
    en: 'Lifts or drops the whole image before sampling. Use it when the symbols come out uniformly too big or too small.',
    ru: 'Поднимает или опускает всю картинку перед сэмплированием. Пригодится, когда символы выходят одинаково слишком крупными или мелкими.',
  },
  'source.contrast': {
    en: 'Pushes light and dark apart. More contrast means a sharper split between big and small symbols.',
    ru: 'Разводит светлое и тёмное. Больше контраста — резче граница между крупными и мелкими символами.',
  },
  'source.gamma': {
    en: 'Bends the middle of the tonal range without moving black or white. Below 1 opens up the shadows, above 1 buries them.',
    ru: 'Изгибает середину тонового диапазона, не трогая чёрное и белое. Меньше 1 — тени раскрываются, больше 1 — уходят вглубь.',
  },
  'source.blackPoint': {
    en: 'Everything below this is treated as pure black. Raise it to clean up a washed-out background.',
    ru: 'Всё ниже этого значения считается чистым чёрным. Поднимите, чтобы вычистить блёклый фон.',
  },
  'source.whitePoint': {
    en: 'Everything above this is treated as pure white. Lower it to bring a flat, grey image back to life.',
    ru: 'Всё выше этого значения считается чистым белым. Опустите, чтобы оживить плоскую серую картинку.',
  },

  /* ---------------- grid ---------------- */
  'grid.mode': {
    en: 'How cells are laid out: a plain square grid, offset rows, a hex packing, or ADAPTIVE, which splits busy areas into smaller cells.',
    ru: 'Как расставлены ячейки: ровный квадрат, смещённые ряды, шестиугольная упаковка или АДАПТИВНАЯ, где насыщенные участки дробятся на мелкие ячейки.',
  },
  'grid.cellSize': {
    en: 'The size of one cell in source pixels. This is the single biggest control over how detailed the result is — and how long it takes to draw.',
    ru: 'Размер одной ячейки в пикселях источника. Главный регулятор детализации — и скорости отрисовки.',
  },
  'grid.minCellSize': {
    en: 'The finest cell the adaptive split may reach. Lower means more detail in the busy areas and many more symbols.',
    ru: 'Самая мелкая ячейка, до которой доходит адаптивное дробление. Меньше — больше деталей в насыщенных местах и намного больше символов.',
  },
  'grid.detail': {
    en: 'How much local contrast it takes for a cell to split into four. Lower splits more eagerly.',
    ru: 'Насколько сильным должен быть локальный контраст, чтобы ячейка разделилась на четыре. Меньше — делится охотнее.',
  },
  'grid.maxDepth': {
    en: 'How many times a cell may keep splitting. A safety limit on how expensive an adaptive grid can get.',
    ru: 'Сколько раз ячейка может делиться подряд. Ограничитель, чтобы адаптивная сетка не стала слишком тяжёлой.',
  },
  'grid.spacingX': {
    en: 'Horizontal gap between cells, as a fraction of cell size. Above 1 the symbols breathe; below 1 they crowd and overlap.',
    ru: 'Горизонтальный зазор между ячейками в долях размера ячейки. Больше 1 — символы дышат, меньше 1 — теснятся и налезают друг на друга.',
  },
  'grid.spacingY': {
    en: 'The same, vertically. Different X and Y spacing is what gives a print or scan-line feel.',
    ru: 'То же по вертикали. Разный шаг по X и Y даёт ощущение печати или строчной развёртки.',
  },
  'grid.offsetX': {
    en: 'Slides the whole grid sideways within one cell. Useful for lining symbols up with a feature in the photo.',
    ru: 'Сдвигает всю сетку вбок в пределах одной ячейки. Помогает совместить символы с деталью на фото.',
  },
  'grid.offsetY': {
    en: 'The same, vertically.',
    ru: 'То же по вертикали.',
  },
  'grid.rotation': {
    en: 'Turns the whole grid. A few degrees off square reads as hand-made rather than mechanical.',
    ru: 'Поворачивает всю сетку. Пара градусов от прямого угла читается как ручная работа, а не машинная.',
  },
  'grid.jitterX': {
    en: 'Randomly nudges each cell sideways. Breaks up the regular rows without changing anything else.',
    ru: 'Случайно смещает каждую ячейку вбок. Разбивает ровные ряды, не трогая всё остальное.',
  },
  'grid.jitterY': {
    en: 'The same, vertically. Same seed always gives the same nudges.',
    ru: 'То же по вертикали. Тот же сид всегда даёт те же смещения.',
  },

  /* ---------------- threshold ---------------- */
  'threshold.min': {
    en: 'Cells darker than this get no symbol at all. Raise it to clear out the background.',
    ru: 'Ячейки темнее этого значения вообще не получают символа. Поднимите, чтобы очистить фон.',
  },
  'threshold.max': {
    en: 'Cells brighter than this get no symbol. Pair with MIN to keep only one band of tones.',
    ru: 'Ячейки светлее этого значения не получают символа. Вместе с МИН оставляет только одну полосу тонов.',
  },
  'threshold.soft': {
    en: 'Fades symbols out near the cut-off instead of stopping dead. A soft edge reads as depth, a hard one as a stencil.',
    ru: 'Плавно гасит символы у порога вместо резкого обрыва. Мягкий край читается как глубина, резкий — как трафарет.',
  },
  'threshold.invert': {
    en: 'Flips the rule: keep what was being dropped and drop what was being kept.',
    ru: 'Переворачивает правило: оставить то, что убиралось, и убрать то, что оставалось.',
  },

  /* ---------------- symbols ---------------- */
  'symbols.selectMode': {
    en: 'How each cell picks its symbol from the pool: at random, in order, or from a smooth noise field so neighbours agree.',
    ru: 'Как ячейка выбирает символ из набора: случайно, по порядку или по гладкому полю шума, чтобы соседи согласовывались.',
  },
  'symbols.strokeWeight': {
    en: 'Line thickness for the symbols that are drawn as strokes rather than filled shapes.',
    ru: 'Толщина линии у символов, которые рисуются штрихом, а не заливкой.',
  },
  'symbols.noiseScale': {
    en: 'How large the patches of one symbol are when NOISE is picking. Small values scatter, large ones give continents.',
    ru: 'Насколько крупные пятна из одного символа получаются в режиме ШУМ. Маленькие значения дают россыпь, большие — целые материки.',
  },
  'symbols.noisePhase': {
    en: 'Walks the noise field around a circle. Animate it 0 to 1 and the pattern churns without ever jumping — 0 and 1 look identical.',
    ru: 'Проводит поле шума по кругу. Анимируйте от 0 до 1 — узор будет перетекать без рывка: 0 и 1 выглядят одинаково.',
  },
  'symbols.sequenceOffset': {
    en: 'Scrolls the pool along the diagonal in SEQUENTIAL mode. Animate it for a marching pattern.',
    ru: 'Прокручивает набор по диагонали в режиме ПО ПОРЯДКУ. Анимируйте — узор поедет.',
  },

  /* ---------------- size ---------------- */
  'size.mode': {
    en: 'Which end of the tonal range gets the big symbols. DARK -> LARGE is the classic halftone; flip it for a negative.',
    ru: 'На каком конце тонового диапазона окажутся крупные символы. ТЁМНОЕ -> КРУПНОЕ — классический растр; переверните для негатива.',
  },
  'size.min': {
    en: 'Size of the smallest symbol, as a multiple of the cell. Set MIN above MAX to reverse the mapping.',
    ru: 'Размер самого мелкого символа в долях ячейки. Поставьте МИН выше МАКС, чтобы развернуть шкалу.',
  },
  'size.max': {
    en: 'Size of the largest symbol, as a multiple of the cell. Above 1 they start to overlap.',
    ru: 'Размер самого крупного символа в долях ячейки. Выше 1 они начинают перекрываться.',
  },
  'size.gamma': {
    en: 'Bends the tone-to-size curve. Below 1 keeps most symbols large, above 1 keeps most of them small.',
    ru: 'Изгибает кривую «тон — размер». Меньше 1 — большинство символов остаются крупными, больше 1 — мелкими.',
  },
  'size.jitter': {
    en: 'Random variation in size per cell. A little of it stops the result looking printed.',
    ru: 'Случайный разброс размера по ячейкам. Немного — и результат перестаёт выглядеть напечатанным.',
  },
  'size.clamp': {
    en: 'Stops a symbol growing past its own cell, whatever MAX says. Keeps a dense grid from turning into a solid block.',
    ru: 'Не даёт символу вылезти за свою ячейку, что бы ни стояло в МАКС. Плотная сетка не превращается в сплошное пятно.',
  },

  /* ---------------- rotation ---------------- */
  'rotation.mode': {
    en: 'What decides each symbol angle: one fixed angle, the image gradient, or a random draw between MIN and MAX.',
    ru: 'Что задаёт угол каждого символа: один фиксированный угол, градиент картинки или случайное значение между МИН и МАКС.',
  },
  'rotation.base': {
    en: 'The angle every symbol starts from, before any gradient or random turn is added.',
    ru: 'Угол, с которого начинает каждый символ, до градиента и случайного поворота.',
  },
  'rotation.gradientDir': {
    en: 'Whether symbols line up along the edges in the photo or across them.',
    ru: 'Выстраивать символы вдоль краёв на фотографии или поперёк них.',
  },
  'rotation.min': {
    en: 'Lower end of the random angle range.',
    ru: 'Нижняя граница диапазона случайного угла.',
  },
  'rotation.max': {
    en: 'Upper end of the random angle range.',
    ru: 'Верхняя граница диапазона случайного угла.',
  },
  'rotation.jitter': {
    en: 'Extra random turn on top of whatever the mode decided.',
    ru: 'Дополнительный случайный поворот поверх того, что решил режим.',
  },

  /* ---------------- colour ---------------- */
  'color.mode': {
    en: 'Where symbol colour comes from: one flat colour, the photo itself, or a gradient mapped onto brightness or position.',
    ru: 'Откуда берётся цвет символа: один ровный цвет, сама фотография или градиент, наложенный на яркость либо на позицию.',
  },
  'color.solid': {
    en: 'The one colour every symbol is painted in.',
    ru: 'Единственный цвет, которым красятся все символы.',
  },
  'color.gradientOffset': {
    en: 'Rolls the gradient ramp round on itself. Animate it and the colour travels across the picture.',
    ru: 'Прокручивает шкалу градиента саму по себе. Анимируйте — и цвет побежит по картинке.',
  },
  'color.hueShift': {
    en: 'Turns every colour round the wheel. The fastest way to retune a whole image without touching the gradient.',
    ru: 'Поворачивает все цвета по кругу. Самый быстрый способ перекрасить всю картинку, не трогая градиент.',
  },
  'color.saturation': {
    en: 'How pure the colours are. All the way down is greyscale.',
    ru: 'Насколько чистые цвета. До упора вниз — оттенки серого.',
  },
  'color.brightness': {
    en: 'Lightens or darkens the symbol colours only. The photo underneath is untouched.',
    ru: 'Осветляет или затемняет только цвет символов. Фотография под ними не меняется.',
  },
  'color.jitter': {
    en: 'Random per-cell variation in colour. Small amounts read as film grain.',
    ru: 'Случайный разброс цвета по ячейкам. В малых дозах читается как зерно плёнки.',
  },

  /* ---------------- opacity ---------------- */
  'opacity.mode': {
    en: 'What drives transparency: a constant value, or the brightness of the cell.',
    ru: 'Что управляет прозрачностью: постоянное значение или яркость ячейки.',
  },
  'opacity.min': {
    en: 'Opacity of the faintest symbols.',
    ru: 'Непрозрачность самых бледных символов.',
  },
  'opacity.max': {
    en: 'Opacity of the strongest symbols.',
    ru: 'Непрозрачность самых плотных символов.',
  },
  'opacity.gamma': {
    en: 'Bends the tone-to-opacity curve, the same way SIZE CURVE bends size.',
    ru: 'Изгибает кривую «тон — непрозрачность», как КРИВАЯ РАЗМЕРА изгибает размер.',
  },
  'opacity.jitter': {
    en: 'Random variation in opacity per cell.',
    ru: 'Случайный разброс непрозрачности по ячейкам.',
  },

  /* ---------------- density ---------------- */
  'density.value': {
    en: 'What share of cells get a symbol at all. Below 100% the grid starts to thin out.',
    ru: 'Какая доля ячеек вообще получает символ. Ниже 100% сетка начинает редеть.',
  },
  'density.mode': {
    en: 'Which cells are dropped first when density falls: a random scatter, or the darkest / lightest ones.',
    ru: 'Какие ячейки исчезают первыми при падении плотности: случайные или самые тёмные / светлые.',
  },
  'density.softness': {
    en: 'Fades cells in around the cut-off instead of popping them on. Animate DENSITY with this raised and the picture assembles itself.',
    ru: 'Плавно проявляет ячейки у порога вместо резкого появления. Анимируйте ПЛОТНОСТЬ с поднятым значением — и картинка соберётся сама.',
  },

  /* ---------------- mask ---------------- */
  'mask.enabled': {
    en: 'Turns the mask on. Without it every cell in the frame is fair game.',
    ru: 'Включает маску. Без неё в дело идут все ячейки кадра.',
  },
  'mask.mode': {
    en: 'GATE hides everything outside the mask. SELECT hides nothing and only marks the area, which is what the zones use.',
    ru: 'ВЫРЕЗАТЬ прячет всё за пределами маски. ВЫДЕЛИТЬ ничего не прячет и только помечает область — этим пользуются зоны.',
  },
  'mask.source': {
    en: 'What the mask is built from: a picked colour range, the brightness of the photo, or its alpha channel.',
    ru: 'Из чего строится маска: взятый диапазон цвета, яркость фотографии или её альфа-канал.',
  },
  'mask.tolerance': {
    en: 'How far a pixel may sit from a picked colour and still count as part of the selection.',
    ru: 'Насколько далеко пиксель может отстоять от взятого цвета и всё ещё попадать в выделение.',
  },
  'mask.threshold': {
    en: 'The cut-off between in and out. Slide it until the edge sits where you want it.',
    ru: 'Граница между «внутри» и «снаружи». Двигайте, пока край не встанет там, где нужно.',
  },
  'mask.feather': {
    en: 'Softens the mask edge. A little feather is what stops a selection looking cut out with scissors.',
    ru: 'Смягчает край маски. Немного растушёвки — и выделение перестаёт выглядеть вырезанным ножницами.',
  },
  'mask.invert': {
    en: 'Swaps inside and outside.',
    ru: 'Меняет местами «внутри» и «снаружи».',
  },
  'mask.silhouette.enabled': {
    en: 'Fills the masked area with a flat colour underneath the symbols.',
    ru: 'Заливает область маски ровным цветом под символами.',
  },
  'mask.silhouette.color': {
    en: 'The colour of that fill.',
    ru: 'Цвет этой заливки.',
  },
  'mask.silhouette.opacity': {
    en: 'How solid the fill is.',
    ru: 'Насколько плотная заливка.',
  },

  /* ---------------- zone (one entry serves Z1 / Z2 / Z3) ---------------- */
  'zone.enabled': {
    en: 'Arms this zone. A zone drives the parameters below only inside its own colour selection — everything else in the frame is left alone.',
    ru: 'Включает эту зону. Зона управляет параметрами ниже только внутри своего цветового выделения — всё остальное в кадре не трогается.',
  },
  'zone.tolerance': {
    en: 'How far a pixel may sit from the picked colour and still belong to this zone. Widen it until the whole object is caught.',
    ru: 'Насколько далеко пиксель может отстоять от взятого цвета и всё ещё принадлежать зоне. Расширяйте, пока объект не поймается целиком.',
  },
  'zone.feather': {
    en: 'Softens the zone edge, so the effect fades in rather than switching on at a line.',
    ru: 'Смягчает край зоны, чтобы эффект нарастал, а не включался по линии.',
  },
  'zone.outside': {
    en: 'Applies everything to what the selection misses instead. Pick the subject, invert, and you are grading the background.',
    ru: 'Применяет всё к тому, что не попало в выделение. Возьмите объект, инвертируйте — и вы работаете с фоном.',
  },
  'zone.strength': {
    en: 'How much of this zone actually lands. Animate it 0 to 1 to bring the whole zone up as one move.',
    ru: 'Насколько сильно зона отрабатывает. Анимируйте от 0 до 1, чтобы поднять всю зону одним движением.',
  },
  'zone.sizeScale': {
    en: 'Multiplies symbol size inside the zone. Animate it and the selected object pulses while the rest holds still.',
    ru: 'Умножает размер символов внутри зоны. Анимируйте — выбранный объект пульсирует, остальное стоит на месте.',
  },
  'zone.opacityScale': {
    en: 'Multiplies opacity inside the zone. Below 1 the zone recedes, above 1 it steps forward.',
    ru: 'Умножает непрозрачность внутри зоны. Ниже 1 зона отступает, выше 1 — выходит вперёд.',
  },
  'zone.densityScale': {
    en: 'Multiplies cell density inside the zone. Thin the background right out and the subject stays solid.',
    ru: 'Умножает плотность ячеек внутри зоны. Разредите фон — объект останется плотным.',
  },
  'zone.rotate': {
    en: 'Extra turn on every symbol inside the zone.',
    ru: 'Дополнительный поворот каждого символа внутри зоны.',
  },
  'zone.hueShift': {
    en: 'Turns the colours inside the zone only. Animate it 0 to 360 for a full cycle that touches nothing else.',
    ru: 'Поворачивает цвета только внутри зоны. Анимируйте от 0 до 360 — полный круг, который больше ничего не затронет.',
  },
  'zone.saturation': {
    en: 'Colour purity inside the zone. Drop it outside the zone instead and only the subject keeps its colour.',
    ru: 'Чистота цвета внутри зоны. Опустите её снаружи зоны — и цвет останется только у объекта.',
  },
  'zone.gradientOffset': {
    en: 'Rolls the gradient inside the zone. A travelling colour band, confined to the selection.',
    ru: 'Прокручивает градиент внутри зоны. Бегущая цветовая полоса, запертая внутри выделения.',
  },
  'zone.motionAmount': {
    en: 'Displaces symbols inside the zone, in pixels. This is what makes a selected object come loose and drift.',
    ru: 'Смещает символы внутри зоны, в пикселях. Именно это заставляет выбранный объект оторваться и поплыть.',
  },
  'zone.edgeOnly': {
    en: 'Keeps only the border of the selection and drops everything else. The fastest way to a glowing outline.',
    ru: 'Оставляет только границу выделения и убирает всё остальное. Самый быстрый путь к светящейся обводке.',
  },
  'zone.edgeThickness': {
    en: 'How wide that border is, in pixels.',
    ru: 'Насколько широка эта граница, в пикселях.',
  },
  'zone.edgeSize': {
    en: 'Multiplies symbol size on the border alone.',
    ru: 'Умножает размер символов только на границе.',
  },
  'zone.edgeOpacity': {
    en: 'Multiplies opacity on the border alone.',
    ru: 'Умножает непрозрачность только на границе.',
  },
  'zone.edgeHue': {
    en: 'Turns the colour of the border alone. Animate it and the colour runs around the outline.',
    ru: 'Поворачивает цвет только на границе. Анимируйте — и цвет побежит по обводке.',
  },

  /* ---------------- edges ---------------- */
  'edges.enabled': {
    en: 'Switches the whole picture over to edge detection: symbols follow outlines instead of tone.',
    ru: 'Переводит всю картинку на поиск контуров: символы идут по очертаниям, а не по тону.',
  },
  'edges.mode': {
    en: 'Whether edges replace the tonal image or are mixed on top of it.',
    ru: 'Заменяют ли контуры тоновую картинку или подмешиваются поверх неё.',
  },
  'edges.threshold': {
    en: 'How strong an edge has to be to count. Raise it to keep only the main outlines.',
    ru: 'Насколько сильным должен быть контур, чтобы попасть в кадр. Поднимите, чтобы остались только основные очертания.',
  },
  'edges.thickness': {
    en: 'How wide the detected edges come out.',
    ru: 'Насколько широкими получаются найденные контуры.',
  },
  'edges.contrast': {
    en: 'Sharpens the difference between weak and strong edges.',
    ru: 'Обостряет разницу между слабыми и сильными контурами.',
  },
  'edges.boost': {
    en: 'Lifts the edge signal overall, so faint outlines still make it through.',
    ru: 'Поднимает сигнал контура в целом, чтобы слабые очертания тоже прошли.',
  },

  /* ---------------- reveal ---------------- */
  'reveal.mode': {
    en: 'Which way the frame fills in: left to right, top to bottom, out from the centre, by brightness, or by noise.',
    ru: 'В какую сторону заполняется кадр: слева направо, сверху вниз, из центра, по яркости или по шуму.',
  },
  'reveal.amount': {
    en: 'How much of the picture is showing. Animate this one from 0 to 1 and you have an intro.',
    ru: 'Какая часть картинки видна. Анимируйте от 0 до 1 — получится интро.',
  },
  'reveal.softness': {
    en: 'How wide the reveal front is. Zero is a hard wipe, wide is a gradient sweeping through.',
    ru: 'Насколько широк фронт проявки. Ноль — резкая шторка, широкий — градиент, проходящий сквозь кадр.',
  },
  'reveal.angle': {
    en: 'The direction the wipe travels.',
    ru: 'Направление, в котором идёт шторка.',
  },
  'reveal.invert': {
    en: 'Reverses it: the picture empties instead of filling.',
    ru: 'Переворачивает: картинка не заполняется, а опустошается.',
  },

  /* ---------------- motion ---------------- */
  'motion.mode': {
    en: 'The shape of the displacement field: a wave, a radial push, or noise. Symbols move; the photo they sample does not.',
    ru: 'Форма поля смещения: волна, радиальный толчок или шум. Двигаются символы, а не фотография, из которой они читают цвет.',
  },
  'motion.amplitudeX': {
    en: 'How far symbols move horizontally, in pixels.',
    ru: 'Насколько далеко символы уезжают по горизонтали, в пикселях.',
  },
  'motion.amplitudeY': {
    en: 'How far symbols move vertically, in pixels.',
    ru: 'Насколько далеко символы уезжают по вертикали, в пикселях.',
  },
  'motion.frequency': {
    en: 'How many waves fit across the frame. Low is a slow swell, high is a ripple.',
    ru: 'Сколько волн укладывается в кадр. Мало — медленная зыбь, много — мелкая рябь.',
  },
  'motion.phase': {
    en: 'Where in the cycle the wave currently is. Key it 0 to 1 for one full cycle and a seamless loop.',
    ru: 'В какой точке цикла сейчас волна. Ключи 0 и 1 дают ровно один цикл и бесшовную петлю.',
  },
  'motion.swirl': {
    en: 'Twists the field around the centre of the frame.',
    ru: 'Закручивает поле вокруг центра кадра.',
  },

  /* ---------------- layers ---------------- */
  'layers.background.mode': {
    en: 'What sits behind everything: black, white, a colour you pick, or nothing at all for a transparent PNG.',
    ru: 'Что лежит позади всего: чёрный, белый, выбранный вами цвет или ничего — для PNG с прозрачностью.',
  },
  'layers.background.color': {
    en: 'The background colour, when the mode is set to a custom one.',
    ru: 'Цвет фона, когда выбран свой цвет.',
  },
  'layers.original.visible': {
    en: 'Shows the photo itself under the symbol pattern.',
    ru: 'Показывает саму фотографию под узором из символов.',
  },
  'layers.original.opacity': {
    en: 'How strongly the photo shows through.',
    ru: 'Насколько сильно проступает фотография.',
  },
  'layers.original.blend': {
    en: 'How the photo is mixed with the background beneath it.',
    ru: 'Как фотография смешивается с фоном под ней.',
  },
  'layers.original.clip': {
    en: 'Restricts the photo to the masked area, or cuts that area out of it so the background shows through the hole.',
    ru: 'Ограничивает фотографию областью маски или, наоборот, вырезает эту область, и сквозь дыру виден фон.',
  },
  'layers.pattern.visible': {
    en: 'Shows the symbol pattern. Turn it off to look at the layers underneath on their own.',
    ru: 'Показывает узор из символов. Выключите, чтобы посмотреть на нижние слои отдельно.',
  },
  'layers.pattern.opacity': {
    en: 'How strongly the symbol pattern shows.',
    ru: 'Насколько сильно виден узор из символов.',
  },
  'layers.pattern.blend': {
    en: 'How the symbol pattern is mixed with everything below it.',
    ru: 'Как узор из символов смешивается со всем, что под ним.',
  },

  /* ---------------- random ---------------- */
  'random.seed': {
    en: 'The number every random choice in the render comes from. The same seed and the same settings always give the same image, down to the pixel.',
    ru: 'Число, из которого берётся вся случайность при отрисовке. Тот же сид и те же настройки всегда дают ту же картинку, вплоть до пикселя.',
  },
}

/** `zone.list.2.hueShift` and `zone.list.0.hueShift` share one entry. */
function normalise(path: string): string {
  return path.replace(/^zone\.list\.\d+\./, 'zone.')
}

export function paramDoc(path: string | undefined, lang: Lang): string | null {
  if (!path) return null
  const doc = PARAM_DOCS[normalise(path)]
  if (!doc) return null
  return lang === 'ru' ? doc.ru : doc.en
}
