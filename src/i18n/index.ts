import { useCallback } from 'react'
import { useUi, type Lang } from '../store/uiStore'
import { RU } from './dict'

export type { Lang }

/**
 * Translation, keyed on the English string.
 *
 * `t('CELL SIZE')` returns the Russian label when the interface is in Russian
 * and the literal itself otherwise, so the English build is a no-op pass and a
 * string nobody has translated yet still renders — in English. There is no key
 * namespace to keep in sync with the components, which is the whole point.
 *
 * Most of the interface never calls this directly: `Row`, `SliderControl`,
 * `Section`, `Toggle`, `SelectControl` and `RadioRow` translate their own
 * labels, so a control declared once is translated once.
 */
export function translate(text: string, lang: Lang): string {
  if (lang === 'en' || !text) return text
  const hit = RU[text]
  if (hit) return hit
  /* Zone parameters carry a `Z1 ` / `Z2 ` / `Z3 ` prefix so three copies of the
     same eighteen labels stay apart in the track menu. The prefix is a number,
     not a word — translate what follows it. */
  const zone = /^(Z[123] )(.+)$/.exec(text)
  if (zone) {
    const rest = RU[zone[2]]
    if (rest) return zone[1] + rest
  }
  return text
}

/** Reactive: re-renders the component when the language changes. */
export function useT(): (text: string) => string {
  const lang = useUi((s) => s.lang)
  return useCallback((text: string) => translate(text, lang), [lang])
}

export function useLang(): Lang {
  return useUi((s) => s.lang)
}

/**
 * A status line, translated as far as it can be.
 *
 * Progress labels are assembled in `engine/` — which has no React and no
 * business importing a store — so they arrive in English with numbers glued on:
 * `EXPORT :: FRAME 12/48`. This splits on the `::` the status bar already uses,
 * then translates the longest leading phrase of each part it recognises and
 * keeps the tail verbatim. `FRAME 12/48` finds `FRAME` and becomes
 * `КАДР 12/48`; a phrase nobody has translated is returned untouched.
 */
export function translateMessage(text: string, lang: Lang): string {
  if (lang === 'en' || !text) return text
  return text
    .split(' :: ')
    .map((part) => {
      const hit = RU[part]
      if (hit) return hit
      const words = part.split(' ')
      for (let take = words.length - 1; take > 0; take--) {
        const head = RU[words.slice(0, take).join(' ')]
        if (head) return head + ' ' + words.slice(take).join(' ')
      }
      return part
    })
    .join(' :: ')
}

/** Reactive form of `translateMessage`. */
export function useMessageT(): (text: string) => string {
  const lang = useUi((s) => s.lang)
  return useCallback((text: string) => translateMessage(text, lang), [lang])
}

/**
 * Non-reactive translation, for strings built outside a component — status
 * messages, export summaries, file labels. Reads the current language directly.
 */
export function tr(text: string): string {
  return translate(text, useUi.getState().lang)
}

/**
 * Joins pre-translated fragments with the `::` separator the status bar uses,
 * so a composed message reads the same in both languages.
 */
export function join(...parts: (string | number | false | null | undefined)[]): string {
  return parts.filter((p) => p !== false && p !== null && p !== undefined && p !== '').join(' :: ')
}
