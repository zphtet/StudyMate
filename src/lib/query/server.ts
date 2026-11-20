import 'server-only'
import { cache } from 'react'
import { makeQueryClient } from './client'

/** One QueryClient per server request, for prefetching in Server Components. */
export const getQueryClient = cache(makeQueryClient)
