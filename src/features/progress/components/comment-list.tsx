'use client'

import { InitialAvatar } from '@/components/shared/initial-avatar'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { cn } from '@/lib/utils'
import type { CommentView } from '../types'

// A thread of comments, oldest first (spec 004 research.md R8): review comments on the Assignment tab
// and Notes. In Notes the viewer's own messages sit on the right (contracts/ui-routes.md › Lesson).

export function CommentList({
  comments,
  label,
  mineOnRight = false,
}: {
  comments: CommentView[]
  label: string
  mineOnRight?: boolean
}) {
  const f = useInstantFormat()
  return (
    <ol aria-label={label} className="flex flex-col gap-3">
      {comments.map((comment) => {
        const right = mineOnRight && comment.isMine
        return (
          <li
            key={comment.id}
            className={cn('flex items-start gap-3', right && 'flex-row-reverse')}
          >
            <InitialAvatar name={comment.authorName} seed={comment.authorId} size="sm" />
            <div
              className={cn(
                'max-w-[85%] min-w-0 rounded-2xl border px-4 py-3',
                right ? 'bg-accent text-accent-foreground' : 'bg-card',
              )}
            >
              <p className="text-sm">
                <span className="font-semibold">{comment.authorName}</span>
                <span className="text-muted-foreground">
                  {' · '}
                  <time dateTime={comment.createdAt}>{f.dayTime(comment.createdAt)}</time>
                </span>
              </p>
              <p className="mt-1 break-words whitespace-pre-wrap">{comment.body}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
