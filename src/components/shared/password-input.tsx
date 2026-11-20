'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { inputClass } from './field'

export function PasswordInput({ className, ...props }: ComponentProps<'input'>) {
  const t = useTranslations('auth.password')
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={cn(inputClass, 'pr-14', className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('hide') : t('show')}
        aria-pressed={visible}
        className="absolute inset-y-0 right-1 my-auto flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"
      >
        {visible ? (
          <EyeOff className="size-5" aria-hidden />
        ) : (
          <Eye className="size-5" aria-hidden />
        )}
      </button>
    </div>
  )
}
