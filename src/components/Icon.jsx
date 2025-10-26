// src/components/Icon.jsx
import CalendarIcon from '@/icons/calendar.svg?react'
import TemplatesIcon from '@/icons/templates.svg?react'
import ChevronDownIcon from '@/icons/chevron-down.svg?react'

const map = {
  calendar: CalendarIcon,
  templates: TemplatesIcon,
  'chevron-down': ChevronDownIcon,
}

export default function Icon({ name, className = '', ariaLabel }) {
  const Cmp = map[name]
  if (!Cmp) return null
  return <Cmp role="img" aria-label={ariaLabel} className={className} />
}
