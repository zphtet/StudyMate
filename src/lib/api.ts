// Typed fetch for TanStack Query queryFns (client side). Errors carry the Route Handler's code.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code)
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null
    throw new ApiError(res.status, body?.error?.code ?? 'unexpected')
  }
  return (await res.json()) as T
}
