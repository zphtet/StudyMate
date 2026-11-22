'use client'

import { Bold, Heading, Image as ImageIcon, Italic, List, Loader2, Volume2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState, type ChangeEvent } from 'react'
import { toast } from 'sonner'
import { Markdown } from '@/components/shared/markdown'
import { MdTextarea } from '@/components/shared/md-textarea'
import { Segmented } from '@/components/shared/segmented'
import { useMediaQuery } from '@/components/shared/use-media-query'
import { Button } from '@/components/ui/button'
import { MAX_CONTENT_BYTES, utf8Bytes } from '@/lib/content'
import { useErrorMessage } from '@/lib/use-error-message'
import type { UploadKind } from '../upload'

// Markdown editor of the lesson screen (screen 20-AdminLessonEdit; spec 002 US2 scenario 2,
// research.md R6). Phones switch Write / Preview; wide screens show both. The preview is the shared
// Markdown component, so it is exactly what students see (SC-002).

const IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif'
const AUDIO_TYPES =
  'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/wav,audio/webm,.mp3,.m4a,.aac,.ogg,.wav'
/** The byte counter appears when the lesson reaches this share of the limit. */
const COUNTER_FROM = 0.75

type Format = 'heading' | 'bold' | 'italic' | 'list'

/** The preview as students see it. Nothing else may sit inside the region (SC-002 test). */
function PreviewPane({ source, label }: { source: string; label: string }) {
  return (
    <div role="region" aria-label={label}>
      <Markdown source={source} />
    </div>
  )
}

export function LessonEditor({
  value,
  onChange,
  upload,
}: {
  value: string
  onChange: (value: string) => void
  /** Uploads and records a picked file; resolves to the Markdown that shows it. */
  upload: (file: File, kind: Extract<UploadKind, 'image' | 'audio'>) => Promise<string>
}) {
  const t = useTranslations('lessonEditor')
  const errorMessage = useErrorMessage()
  const wide = useMediaQuery('(min-width: 1024px)')
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [uploading, setUploading] = useState<'image' | 'audio' | null>(null)
  const area = useRef<HTMLDivElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const audioInput = useRef<HTMLInputElement>(null)

  const previewOnly = !wide && mode === 'preview'
  const bytes = utf8Bytes(value)
  const tooLong = bytes > MAX_CONTENT_BYTES
  const textarea = () => area.current?.querySelector('textarea') ?? null

  // Formatting goes through the editor's own commands, so it lands at the cursor and can be undone.
  async function format(kind: Format) {
    const element = textarea()
    if (!element) return
    const md = await import('@uiw/react-md-editor/nohighlight')
    const command = {
      heading: md.title,
      bold: md.bold,
      italic: md.italic,
      list: md.unorderedListCommand,
    }[kind]
    new md.TextAreaCommandOrchestrator(element).executeCommand(command)
  }

  async function insert(markdown: string) {
    const element = textarea()
    if (!element) {
      onChange(`${value}${value && !value.endsWith('\n') ? '\n\n' : ''}${markdown}\n`)
      return
    }
    const before = element.value.slice(0, element.selectionStart)
    const gap =
      before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    const { insertTextAtPosition } = await import('@uiw/react-md-editor/nohighlight')
    insertTextAtPosition(element, `${gap}${markdown}\n`)
  }

  async function onPick(kind: 'image' | 'audio', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(kind)
    try {
      await insert(await upload(file, kind))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setUploading(null)
    }
  }

  const tools: { kind: Format; label: string; icon: typeof Bold }[] = [
    { kind: 'heading', label: t('heading'), icon: Heading },
    { kind: 'bold', label: t('bold'), icon: Bold },
    { kind: 'italic', label: t('italic'), icon: Italic },
    { kind: 'list', label: t('list'), icon: List },
  ]
  const toolsDisabled = previewOnly

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-3xl border bg-card">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted/40 p-2">
          {/* Hidden by CSS on wide screens, so the first paint is right before hydration. */}
          <Segmented
            name="editor-mode"
            legend={t('editorMode')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'write', label: t('write') },
              { value: 'preview', label: t('preview') },
            ]}
            className="w-full sm:w-56 lg:hidden"
          />
          <div role="toolbar" aria-label={t('toolbar')} className="flex items-center">
            {tools.map(({ kind, label, icon: Icon }) => (
              <Button
                key={kind}
                type="button"
                variant="ghost"
                size="icon-touch"
                aria-label={label}
                title={label}
                disabled={toolsDisabled}
                onClick={() => void format(kind)}
              >
                <Icon aria-hidden className="size-5" />
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              aria-label={t('insertImage')}
              title={t('insertImage')}
              disabled={toolsDisabled || uploading !== null}
              onClick={() => imageInput.current?.click()}
            >
              {uploading === 'image' ? (
                <Loader2 aria-hidden className="size-5 animate-spin" />
              ) : (
                <ImageIcon aria-hidden className="size-5" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              aria-label={t('insertAudio')}
              title={t('insertAudio')}
              disabled={toolsDisabled || uploading !== null}
              onClick={() => audioInput.current?.click()}
            >
              {uploading === 'audio' ? (
                <Loader2 aria-hidden className="size-5 animate-spin" />
              ) : (
                <Volume2 aria-hidden className="size-5" />
              )}
            </Button>
            {uploading && (
              <span role="status" className="ml-1 text-sm text-muted-foreground">
                {t('uploading')}
              </span>
            )}
          </div>
          <input
            ref={imageInput}
            type="file"
            accept={IMAGE_TYPES}
            hidden
            tabIndex={-1}
            onChange={(e) => void onPick('image', e)}
          />
          <input
            ref={audioInput}
            type="file"
            accept={AUDIO_TYPES}
            hidden
            tabIndex={-1}
            onChange={(e) => void onPick('audio', e)}
          />
        </div>

        <div ref={area} hidden={previewOnly}>
          <MdTextarea
            value={value}
            onChange={onChange}
            label={t('lessonText')}
            placeholder={t('placeholder')}
            live={wide}
            renderPreview={(source) => <PreviewPane source={source} label={t('preview')} />}
          />
        </div>
        {previewOnly && (
          <div className="min-h-90 px-5 py-4">
            <PreviewPane source={value} label={t('preview')} />
          </div>
        )}
      </div>

      {tooLong ? (
        <p role="alert" className="text-sm text-destructive">
          {t('tooLong')}
        </p>
      ) : (
        bytes >= MAX_CONTENT_BYTES * COUNTER_FROM && (
          <p className="text-right text-sm text-muted-foreground">
            {t('bytes', {
              used: (bytes / 1024).toFixed(1),
              max: MAX_CONTENT_BYTES / 1024,
            })}
          </p>
        )
      )}
    </div>
  )
}
