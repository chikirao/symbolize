import React from 'react'
import { useT, translate } from '../i18n'
import { paramDoc } from '../i18n/paramDocs'
import { Divider, Section } from './Primitives'
import { SeedControl } from './SeedControl'
import { GradientEditor } from './GradientEditor'
import { SelectionPicker } from './SelectionPicker'

const normalise = (text: string) => text.toLocaleLowerCase().replace(/ё/g, 'е')

/** Search the actual control declarations, including both translations and descriptions. */
function matches(query: string[], ...terms: (string | null | undefined)[]): boolean {
  const text = normalise(terms.filter(Boolean).join(' '))
  return query.every((word) => text.includes(word))
}

function filterControls(children: React.ReactNode, words: string[]): React.ReactNode[] {
  return React.Children.toArray(children).flatMap((child): React.ReactNode[] => {
    if (!React.isValidElement(child)) return []
    const props = child.props as { path?: string; label?: string; children?: React.ReactNode; options?: { label: string }[]; prefix?: string }
    if (child.type === Divider) return []
    const path = props.path || (child.type === SeedControl ? 'random.seed' : child.type === GradientEditor ? 'color.stops' : '')
    const label = props.label || (child.type === SeedControl ? 'SEED' : child.type === GradientEditor ? 'GRADIENT' : '')
    if (path || label) {
      return matches(words, path, label, translate(label, 'ru'), paramDoc(path, 'en'), paramDoc(path, 'ru'),
        ...(props.options || []).flatMap((option) => [option.label, translate(option.label, 'ru')])) ? [child] : []
    }
    if (child.type === SelectionPicker) {
      const prefix = props.prefix || 'mask'
      const terms = ['PICK COLOR', 'CONTIGUOUS (WAND)', 'CLEAR']
      return matches(words, prefix, ...terms.flatMap((term) => [term, translate(term, 'ru')]),
        paramDoc(prefix + '.contiguous', 'en'), paramDoc(prefix + '.contiguous', 'ru')) ? [child] : []
    }
    if (props.children) {
      const found = filterControls(props.children, words)
      return found.length ? [React.cloneElement(child as React.ReactElement<{ children: React.ReactNode }>, {}, found)] : []
    }
    return []
  })
}

export function ParameterSearch(props: { query: string; onQuery: (value: string) => void; children: React.ReactNode }) {
  const t = useT()
  const words = normalise(props.query).trim().split(/\s+/).filter(Boolean)
  const searching = words.length > 0
  const sections = React.Children.toArray(props.children).flatMap((child) => {
    if (!searching) return [child]
    if (!React.isValidElement(child) || child.type !== Section) return []
    const section = child as React.ReactElement<React.ComponentProps<typeof Section>>
    const all = matches(words, section.props.title, translate(section.props.title, 'ru'))
    const children = all ? section.props.children : filterControls(section.props.children, words)
    if (!all && React.Children.count(children) === 0) return []
    return [React.cloneElement(section, { open: true, lockedOpen: true, children })]
  })

  return (
    <div className="parameter-search">
      <div className="parameter-search-bar">
        <input
          type="search"
          value={props.query}
          aria-label={t('SEARCH PARAMETERS')}
          placeholder={t('SEARCH PARAMETERS')}
          onChange={(event) => props.onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && props.query) {
              event.preventDefault()
              event.stopPropagation()
              props.onQuery('')
            }
          }}
        />
        {props.query && <button type="button" className="btn" onClick={() => props.onQuery('')} aria-label={t('CLEAR SEARCH')}>[X]</button>}
      </div>
      {searching && <div className="parameter-search-status" role="status">
        {sections.length ? `${t('MATCHING SECTIONS')}: ${sections.length}` : t('NO PARAMETERS FOUND')}
      </div>}
      {sections}
    </div>
  )
}
