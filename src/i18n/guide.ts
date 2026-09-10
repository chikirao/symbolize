import type { Lang } from '../store/uiStore'

/**
 * The walkthrough for the animation mode.
 *
 * Written as steps rather than a feature list on purpose: the mode is not hard
 * to understand, it is hard to *start* — a video, a timeline, keyframes and a
 * colour selection all landed in the same panel at once, and nothing said which
 * one you are supposed to touch first. So this is the order you actually do
 * things in, and each step names the control it is talking about exactly as the
 * interface spells it.
 */

export interface GuideStep {
  title: { en: string; ru: string }
  lines: { en: string; ru: string }[]
}

export const GUIDE_TITLE = {
  en: 'HOW THE ANIMATION MODE WORKS',
  ru: 'КАК РАБОТАЕТ РЕЖИМ АНИМАЦИИ',
}

export const GUIDE_LEAD = {
  en: 'Seven steps, in the order you do them. Everything runs in this browser — no upload, no server.',
  ru: 'Семь шагов в том порядке, в котором их делают. Всё работает в этом браузере — ничего никуда не загружается.',
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    title: { en: 'TWO THINGS CAN MOVE', ru: 'ДВИГАТЬСЯ МОЖЕТ ДВА' },
    lines: [
      {
        en: 'The picture: drop in a video or an animated GIF and every frame goes through the same symbol pipeline.',
        ru: 'Картинка: бросьте видео или анимированный GIF — каждый кадр пройдёт через тот же конвейер символов.',
      },
      {
        en: 'The settings: put keyframes on any parameter and a single still photo starts breathing.',
        ru: 'Настройки: поставьте ключи на любой параметр — и одна статичная фотография начнёт дышать.',
      },
      {
        en: 'Both share one timeline, and you can use them together.',
        ru: 'У обоих один таймлайн, и их можно совмещать.',
      },
    ],
  },
  {
    title: { en: 'BRING THE CLIP IN', ru: 'ЗАГРУЗИТЕ РОЛИК' },
    lines: [
      {
        en: 'Drop an MP4, WEBM, MOV or an animated GIF anywhere on the window.',
        ru: 'Бросьте MP4, WEBM, MOV или анимированный GIF в любое место окна.',
      },
      {
        en: 'SOURCE > IMPORT decides how it is taken apart: SIZE is the decode resolution, RATE 0 reads the clip’s own frame rate, MAX FRAMES caps the length, TRIM cuts seconds off each end.',
        ru: 'ИСТОЧНИК > ИМПОРТ решает, как его разобрать: РАЗМЕР — разрешение декодирования, ЧАСТОТА 0 — взять частоту из самого ролика, МАКС. КАДРОВ ограничивает длину, ОБРЕЗКА срезает секунды с концов.',
      },
      {
        en: 'Frames are held in memory, so a smaller decode size is a faster everything. Change a setting and load the file again to re-decode.',
        ru: 'Кадры держатся в памяти, поэтому меньший размер декодирования ускоряет всё сразу. Поменяли настройку — загрузите файл заново.',
      },
    ],
  },
  {
    title: { en: 'OPEN THE TIMELINE', ru: 'ОТКРОЙТЕ ТАЙМЛАЙН' },
    lines: [
      {
        en: '[+] TIMELINE along the bottom expands it. PLAY, or the space bar. Arrow keys step one frame, with Shift ten.',
        ru: '[+] ТАЙМЛАЙН внизу разворачивает его. ПУСК или пробел. Стрелки — шаг на кадр, с Shift — на десять.',
      },
      {
        en: 'FPS and LEN set the speed and the length; LOOP IN / OUT plays only a stretch of it.',
        ru: 'FPS и ДЛИНА задают скорость и длину; ЦИКЛ ОТ / ДО проигрывает только участок.',
      },
      {
        en: 'Playback drops frames when the render is slow — that is deliberate, and the export never drops one.',
        ru: 'При медленной отрисовке воспроизведение пропускает кадры — так задумано, а экспорт не пропускает ни одного.',
      },
    ],
  },
  {
    title: { en: 'PICK A ZONE — THIS IS THE POINT', ru: 'ВЫДЕЛИТЕ ЗОНУ — РАДИ ЭТОГО ВСЁ' },
    lines: [
      {
        en: 'Open the ZONE section, press PICK COLOR and click that colour on the canvas. TOLERANCE widens the range around it, FEATHER softens the edge.',
        ru: 'Откройте раздел ЗОНА, нажмите ПИПЕТКА и кликните по этому цвету на холсте. ДОПУСК расширяет диапазон вокруг него, РАСТУШЁВКА смягчает край.',
      },
      {
        en: 'Everything under INSIDE THE ZONE then applies to that area alone: size, opacity, density, rotation, hue, saturation, gradient, motion.',
        ru: 'Дальше всё под заголовком ВНУТРИ ЗОНЫ применяется только к этой области: размер, непрозрачность, плотность, поворот, оттенок, насыщенность, градиент, движение.',
      },
      {
        en: 'On a video the selection is re-read every frame, so the zone follows the object as it moves. Three zones, tabs [1] [2] [3], each with its own picks.',
        ru: 'На видео выделение пересчитывается на каждом кадре, поэтому зона следует за объектом. Зон три — вкладки [1] [2] [3], у каждой свои цвета.',
      },
    ],
  },
  {
    title: { en: 'MAKE IT MOVE', ru: 'ЗАСТАВЬТЕ ЭТО ДВИГАТЬСЯ' },
    lines: [
      {
        en: 'Quickest way: + PRESET in the timeline. ZONE PULSE, ZONE HUE, ZONE RIPPLE and ZONE OUTLINE all drive zone 1, so pick a colour first.',
        ru: 'Быстрее всего: + ПРЕСЕТ в таймлайне. ЗОНА: ПУЛЬС, ЗОНА: ЦВЕТ, ЗОНА: РЯБЬ и ЗОНА: ОБВОДКА работают по зоне 1, так что сначала возьмите цвет.',
      },
      {
        en: 'By hand: turn AUTO KEY on, move the playhead, move a slider. That writes a keyframe.',
        ru: 'Вручную: включите АВТОКЛЮЧ, переставьте позицию, подвиньте ползунок. Это и запишет ключ.',
      },
      {
        en: 'The marker beside a parameter says where it stands: [ ] not animated, [.] animated but no key here, [*] a key on this frame. Click it to add or remove one.',
        ru: 'Значок рядом с параметром показывает состояние: [ ] не анимирован, [.] анимирован, но ключа здесь нет, [*] на этом кадре ключ. Клик добавляет или убирает.',
      },
    ],
  },
  {
    title: { en: 'EXPORT IT', ru: 'ЭКСПОРТИРУЙТЕ' },
    lines: [
      {
        en: 'PARAMETERS > EXPORT, then set OUTPUT to ANIMATION. GIF plays everywhere, WEBM is small and sharp, APNG keeps full colour and alpha, PNG SEQ is one file per frame.',
        ru: 'ПАРАМЕТРЫ > ЭКСПОРТ, затем ВЫВОД: АНИМАЦИЯ. GIF играет везде, WEBM маленький и чёткий, APNG сохраняет полный цвет и альфу, PNG СЕКВЕНЦИЯ — по файлу на кадр.',
      },
      {
        en: 'For GIF, ONE PALETTE builds a single colour table for the whole clip: gradients stop shimmering and the file gets smaller.',
        ru: 'Для GIF ОДНА ПАЛИТРА строит одну таблицу цветов на весь ролик: градиенты перестают мерцать, а файл становится меньше.',
      },
      {
        en: 'Export renders every frame offline and can be cancelled at any point.',
        ru: 'Экспорт отрисовывает каждый кадр отдельно и в любой момент отменяется.',
      },
    ],
  },
  {
    title: { en: 'IF IT CRAWLS', ru: 'ЕСЛИ ВСЁ ТОРМОЗИТ' },
    lines: [
      {
        en: 'CELL SIZE is the biggest lever there is — a couple of pixels larger can halve the work.',
        ru: 'РАЗМЕР ЯЧЕЙКИ — самый мощный рычаг: пара пикселей больше может вдвое сократить работу.',
      },
      {
        en: 'Then: a smaller decode SIZE, fewer MAX FRAMES, and VIEW > QUALITY LOW while you are still choosing.',
        ru: 'Дальше: меньший РАЗМЕР декодирования, меньше МАКС. КАДРОВ и ВИД > КАЧЕСТВО НИЗКОЕ, пока вы ещё выбираете.',
      },
      {
        en: 'Preview quality has no effect on the export — that always renders at full size.',
        ru: 'Качество превью никак не влияет на экспорт — он всегда рисуется в полном размере.',
      },
    ],
  },
]

export function guideText(pair: { en: string; ru: string }, lang: Lang): string {
  return lang === 'ru' ? pair.ru : pair.en
}
