// Spec 002 SC-002 (T045): the editor preview renders exactly the HTML the student view renders,
// because both use the shared Markdown component.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import { Markdown } from '@/components/shared/markdown'
import { MARKDOWN_SAMPLES } from '@/components/shared/markdown.samples'
import { IntlWrapper } from '../../../../tests/utils/intl'
import { MAX_CONTENT_BYTES } from '@/lib/content'
import { LessonEditor } from './lesson-editor'

// The real editor (@uiw/react-md-editor) loads with next/dynamic in the browser only.
vi.mock('@/components/shared/md-textarea', () => ({
  MdTextarea: ({
    value,
    onChange,
    label,
  }: {
    value: string
    onChange: (value: string) => void
    label: string
  }) => <textarea aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />,
}))

const studentHtml = (source: string) =>
  renderToStaticMarkup(
    <IntlWrapper>
      <Markdown source={source} />
    </IntlWrapper>,
  )

/** Parses HTML and writes it back with sorted attributes, so server markup and DOM markup compare
 *  by content (attribute order, case and entity escaping differ between the two serializers). */
function normalize(html: string) {
  const root = document.createElement('div')
  root.innerHTML = html
  for (const element of root.querySelectorAll('*')) {
    const attributes = [...element.attributes].map((a) => [a.name, a.value] as const)
    for (const [name] of attributes) element.removeAttribute(name)
    for (const [name, value] of attributes.sort(([a], [b]) => a.localeCompare(b))) {
      element.setAttribute(name, value)
    }
  }
  return root.innerHTML
}

function renderEditor(value: string) {
  return render(<LessonEditor value={value} onChange={() => {}} upload={vi.fn()} />, {
    wrapper: IntlWrapper,
  })
}

describe('LessonEditor', () => {
  test.each(Object.entries(MARKDOWN_SAMPLES))(
    'Preview of the "%s" sample is identical to the student view',
    async (_name, source) => {
      renderEditor(source)
      expect(screen.queryByRole('region', { name: 'Preview' })).toBeNull()
      await userEvent.click(screen.getByRole('radio', { name: 'Preview' }))
      const preview = screen.getByRole('region', { name: 'Preview' })
      expect(normalize(preview.innerHTML)).toBe(normalize(studentHtml(source)))
    },
  )

  test('Write mode shows the text and the toolbar; Preview disables the toolbar', async () => {
    renderEditor('## は')
    expect(screen.getByLabelText('Lesson text')).toHaveValue('## は')
    expect(screen.getByRole('button', { name: 'Bold' })).toBeEnabled()
    await userEvent.click(screen.getByRole('radio', { name: 'Preview' }))
    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Insert image' })).toBeDisabled()
  })

  test('warns above the data-model.md Lesson.contentMd limit', () => {
    renderEditor('a'.repeat(MAX_CONTENT_BYTES))
    expect(screen.queryByRole('alert')).toBeNull()
    renderEditor('a'.repeat(MAX_CONTENT_BYTES + 1))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Over 200 KB: saving is paused until the lesson is shorter.',
    )
  })
})
