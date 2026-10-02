import type { Lang } from '../store/uiStore'

interface Copy { en: string; ru: string }
export const tutorialText = (copy: Copy, lang: Lang) => copy[lang]

export const TUTORIAL_STEPS: { title: Copy; body: Copy; desktop: string; mobile: string }[] = [
  {
    title: { en: 'SOURCE', ru: 'ИСТОЧНИК' },
    body: {
      en: 'Start with a photo, video or GIF. Load a file, drag it onto the page, or paste an image with Ctrl+V. The demo image is ready to experiment with.',
      ru: 'Начните с фото, видео или GIF. Откройте файл, перетащите его на страницу или вставьте картинку через Ctrl+V. С демо-картинкой можно сразу экспериментировать.',
    },
    desktop: '.panel-source', mobile: '[data-tour="dock-image"]',
  },
  {
    title: { en: 'ELEMENTS', ru: 'ЭЛЕМЕНТЫ' },
    body: {
      en: 'Choose the shapes that make up the image. You can turn groups on and off, change their weights, and add your own symbols.',
      ru: 'Выберите фигуры, из которых собирается изображение. Здесь можно включать наборы, менять вес элементов и добавлять свои символы.',
    },
    desktop: '.panel-elements', mobile: '[data-tour="dock-symbols"]',
  },
  {
    title: { en: 'PRESETS', ru: 'ПРЕСЕТЫ' },
    body: {
      en: 'A preset gives you a quick starting look. Open this panel and choose one, then tune it with the parameters.',
      ru: 'Пресет быстро задаёт готовый стиль. Откройте эту панель, выберите вариант и затем настройте его параметрами.',
    },
    desktop: '.panel-presets', mobile: '[data-tour="dock-presets"]',
  },
  {
    title: { en: 'CANVAS', ru: 'ХОЛСТ' },
    body: {
      en: 'The result appears here. Drag to move, use the mouse wheel or two fingers to zoom, and use FIT to see the whole image.',
      ru: 'Здесь видно результат. Перетаскивайте изображение, увеличивайте колесом или двумя пальцами и нажимайте «Вписать», чтобы увидеть его целиком.',
    },
    desktop: '[data-tour="canvas"]', mobile: '[data-tour="canvas"]',
  },
  {
    title: { en: 'PARAMETERS', ru: 'ПАРАМЕТРЫ' },
    body: {
      en: 'Change grid, size, colour, density and masking here. The basic controls are shown first; switch to ADVANCED for finer adjustments.',
      ru: 'Меняйте сетку, размер, цвет, плотность и маску. Сначала показаны основные настройки; режим ADVANCED открывает тонкую настройку.',
    },
    desktop: '.panel-params', mobile: '[data-tour="dock-params"]',
  },
  {
    title: { en: 'ANIMATION', ru: 'АНИМАЦИЯ' },
    body: {
      en: 'Open the timeline to animate parameters with keyframes or play an imported clip. Its [?] button explains animation in detail.',
      ru: 'Откройте таймлайн, чтобы анимировать параметры ключевыми кадрами или воспроизвести загруженный ролик. Кнопка [?] расскажет об анимации подробнее.',
    },
    desktop: '.desktop-timeline', mobile: '[data-tour="dock-anim"]',
  },
  {
    title: { en: 'EXPORT', ru: 'ЭКСПОРТ' },
    body: {
      en: 'Save a still image as PNG or export animation as GIF, WebM, APNG or PNG frames. Everything is processed locally in your browser.',
      ru: 'Сохраните картинку в PNG или анимацию в GIF, WebM, APNG либо набор кадров PNG. Всё обрабатывается локально в браузере.',
    },
    desktop: '[data-tour="menu-export"]', mobile: '[data-tour="dock-export"]',
  },
  {
    title: { en: 'UNDO / REDO', ru: 'НАЗАД / ВПЕРЁД' },
    body: {
      en: 'Made a change you do not like? Use these buttons or Ctrl+Z to undo. Ctrl+Shift+Z or Ctrl+Y restores it. Your edits have a 60-step history.',
      ru: 'Не понравилось изменение? Отмените его кнопкой или Ctrl+Z. Ctrl+Shift+Z или Ctrl+Y вернёт действие. История хранит 60 шагов текущего изображения.',
    },
    desktop: '[data-tour="history"]', mobile: '[data-tour="history"]',
  },
  {
    title: { en: 'HELP', ru: 'СПРАВКА' },
    body: {
      en: 'You can start this tour again from HELP. The animation guide is available there too.',
      ru: 'Этот тур можно снова запустить из справки. Там же доступно подробное обучение анимации.',
    },
    desktop: '[data-tour="menu-help"]', mobile: '[data-tour="dock-help"]',
  },
]
