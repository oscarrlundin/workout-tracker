// src/components/Icon.jsx
import CalendarIcon     from '@/icons/calendar.svg?react'
import TemplatesIcon    from '@/icons/templates.svg?react'
import ChevronDownIcon  from '@/icons/chevron-down.svg?react'
import PlusIcon         from '@/icons/plus.svg?react'
import HomeIcon       from '@/icons/home.svg?react'
import TrendingUpIcon from '@/icons/trending-up.svg?react'
import DumbbellIcon   from '@/icons/dumbbell.svg?react'
import GridIcon       from '@/icons/grid.svg?react'
import SettingsIcon   from '@/icons/settings.svg?react'

const map = {
  calendar: CalendarIcon,
  templates: TemplatesIcon,
  'chevron-down': ChevronDownIcon,
  plus: PlusIcon,
  home: HomeIcon,
  progress: TrendingUpIcon,
  exercises: DumbbellIcon,
  grid: GridIcon,
  settings: SettingsIcon,
}

export default function Icon({ name, className = '', ariaLabel }) {
  const Cmp = map[name]
  if (!Cmp) {
    console.warn(`[Icon] unknown icon name: "${name}"`)
    return null
  }
  return <Cmp role="img" aria-label={ariaLabel} className={className} />
}