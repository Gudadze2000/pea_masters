import { refreshSession } from "./auth"

/** An error the backend explained; `message` is written for people and can be shown as is. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type Detail = { code?: unknown; message?: unknown } | { msg?: unknown }[] | string | null | undefined

function toError(status: number, detail: Detail): ApiError {
  if (detail && typeof detail === "object" && !Array.isArray(detail) && typeof detail.message === "string") {
    return new ApiError(status, typeof detail.code === "string" ? detail.code : "error", detail.message)
  }
  if (Array.isArray(detail)) {
    // FastAPI's field validation errors
    const reasons = detail.map(item => (typeof item.msg === "string" ? item.msg : "")).filter(Boolean)
    return new ApiError(status, "invalid", `Please check the form: ${reasons.join("; ") || "some fields are invalid"}.`)
  }
  if (status === 401) return new ApiError(status, "signed_out", "Your session has ended. Please sign in again.")
  if (status === 403) return new ApiError(status, "forbidden", "You don't have permission to do this.")
  if (status >= 500) return new ApiError(status, "server", "The server had a problem. Please try again.")
  return new ApiError(status, "error", "Something went wrong. Please try again.")
}

/** Calls the PEA API (same origin, session cookie included). Throws ApiError on failure. */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response
  try {
    // FormData (file uploads) is sent as multipart and sets its own Content-Type; anything else as JSON
    const isForm = options.body instanceof FormData
    response = await fetch(`/api/v1${path}`, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      headers: options.body === undefined || isForm ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError(0, "offline", "Can't reach the PEA server. Check your connection and try again.")
  }
  const data: unknown = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) void refreshSession() // session expired: the app sends the person to /login
    throw toError(response.status, (data as { detail?: Detail } | null)?.detail)
  }
  return data as T
}
