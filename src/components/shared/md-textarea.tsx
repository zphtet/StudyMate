'use client'

import { useTheme } from 'next-themes'
import dynamic from 'next/dynamic'
import type { JSX } from 'react'

// @uiw/react-md-editor (spec 002 research.md R6), browser only; used by the lesson editor (002) and
// the assignment editor (004). The build without code highlighting keeps the phone bundle small. Its
// own toolbar is hidden: callers draw one with 44 px buttons.
const MDEditor = dynamic(() => import('@uiw/react-md-editor/nohighlight'), {
  ssr: false,
  loading: () => <div className="h-90 animate-pulse bg-muted/40" />,
})

export function MdTextarea({
  value,
  onChange,
  label,
  placeholder,
  live,
  renderPreview,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  /** Side-by-side text and preview (≥ 1024 px). */
  live: boolean
  renderPreview: (source: string) => JSX.Element
}) {
  const { resolvedTheme } = useTheme()
  return (
    <div className="lesson-md-editor" data-color-mode={resolvedTheme === 'dark' ? 'dark' : 'light'}>
      <MDEditor
        value={value}
        onChange={(next) => onChange(next ?? '')}
        preview={live ? 'live' : 'edit'}
        hideToolbar
        visibleDragbar={false}
        highlightEnable={false}
        height={live ? 560 : 360}
        textareaProps={{ 'aria-label': label, placeholder }}
        components={{ preview: (source) => renderPreview(source) }}
      />
    </div>
  )
}
