// src/components/Icon.jsx
import CalendarIcon from '@/icons/calendar.svg?react'
import TemplatesIcon from '@/icons/templates.svg?react'
import ChevronDownIcon from '@/icons/chevron-down.svg?react'
import PlusIcon from '@/icons/plus.svg?react'

const map = {
  calendar: CalendarIcon,
  templates: TemplatesIcon,
  'chevron-down': ChevronDownIcon,
  plus: PlusIcon,
}

export default function Icon({ name, className = '', ariaLabel }) {
  const Cmp = map[name]
  if (!Cmp) {
    console.warn(`[Icon] unknown icon name: "${name}"`)
    return null
  }
  return <Cmp role="img" aria-label={ariaLabel} className={className} />
}
