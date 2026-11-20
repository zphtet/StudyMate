'use client'

import { REGEXP_ONLY_DIGITS, REGEXP_ONLY_DIGITS_AND_CHARS } from 'input-otp'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { cn } from '@/lib/utils'

// Six boxes for email codes (digits) and invite codes (letters + digits). Paste of a full code
// works; one accessible input underneath, labelled by the caller (screenshots 27, 29, 03).
export function CodeInput({
  value,
  onChange,
  onComplete,
  kind = 'digits',
  label,
  invalid,
  disabled,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  kind?: 'digits' | 'invite'
  label: string
  invalid?: boolean
  disabled?: boolean
  autoFocus?: boolean
}) {
  return (
    <InputOTP
      maxLength={6}
      value={value}
      onChange={(v) => onChange(kind === 'invite' ? v.toUpperCase() : v)}
      onComplete={onComplete}
      pattern={kind === 'digits' ? REGEXP_ONLY_DIGITS : REGEXP_ONLY_DIGITS_AND_CHARS}
      inputMode={kind === 'digits' ? 'numeric' : 'text'}
      autoComplete={kind === 'digits' ? 'one-time-code' : 'off'}
      aria-label={label}
      aria-invalid={invalid || undefined}
      disabled={disabled}
      autoFocus={autoFocus}
      containerClassName="w-full"
    >
      <InputOTPGroup className="grid w-full grid-cols-6 gap-2.5">
        {Array.from({ length: 6 }, (_, i) => (
          <InputOTPSlot
            key={i}
            index={i}
            className={cn(
              'aspect-[5/6] h-auto w-full rounded-2xl border bg-card text-2xl font-semibold first:rounded-2xl last:rounded-2xl',
              'data-[active=true]:border-2 data-[active=true]:border-primary data-[active=true]:ring-0',
              invalid && 'border-destructive',
            )}
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}
