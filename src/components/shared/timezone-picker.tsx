'use client'

import { Check, Globe } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/** The device's IANA zone (research R14), or UTC if the browser can't tell. */
export function detectTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function allTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return ['UTC']
  }
}

// "Time zone: Asia/Tokyo (detected) · Change" with a searchable list (screenshot 02-Signup).
export function TimezonePicker({
  value,
  detected,
  onChange,
}: {
  value: string
  detected: boolean
  onChange: (zone: string) => void
}) {
  const t = useTranslations('auth')
  const [open, setOpen] = useState(false)
  const zones = useMemo(() => allTimeZones(), [])

  return (
    <div className="flex items-center gap-3 text-sm">
      <Globe className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 flex-1 text-muted-foreground">
        {t('signUp.timezone')} <span className="font-semibold text-foreground">{value}</span>
        {detected && <> {t('signUp.detected')}</>}
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-mr-2 min-h-11 shrink-0 rounded-lg px-2 font-semibold text-primary hover:underline"
      >
        {t('signUp.change')}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>{t('timezone.title')}</SheetTitle>
          </SheetHeader>
          <Command className="px-4 pb-4">
            <CommandInput placeholder={t('timezone.search')} aria-label={t('timezone.search')} />
            <CommandList className="max-h-[55dvh]">
              <CommandEmpty>{t('timezone.empty')}</CommandEmpty>
              {zones.map((zone) => (
                <CommandItem
                  key={zone}
                  value={zone}
                  className="min-h-11"
                  onSelect={() => {
                    onChange(zone)
                    setOpen(false)
                  }}
                >
                  <span className="flex-1">{zone.replaceAll('_', ' ')}</span>
                  {zone === value && <Check aria-hidden />}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </SheetContent>
      </Sheet>
    </div>
  )
}
