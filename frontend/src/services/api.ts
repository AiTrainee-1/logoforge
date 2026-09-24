/**
 * Typed client for the LogoForge Flask API.
 *
 * The backend URL is never hard-coded: set `VITE_API_URL` (see `.env.example`).
 */
import type {
  ComposeResult,
  ImageTransform,
  JobStatus,
  ProcessedResult,
} from '@/types/editor'

const RAW_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:5000') as string
export const API_BASE = RAW_BASE.replace(/\/+$/, '')

export class ApiError extends Error {
  code: string
  status: number

  constructor(message: string, code = 'REQUEST_FAILED', status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export interface ServerImage {
  id: string
  name: string
  width: number
  height: number
  size: number
  format: string
  mime: string
  hasAlpha: boolean
  animated: boolean
}

export interface ServerLogo {
  id: string
  name: string
  width: number
  height: number
  size: number
}

export interface JobResponse {
  jobId: string
  images: ServerImage[]
  logo: ServerLogo | null
  status: JobStatus['status']
  progress: number
  total: number
  completed: number
  failed: number
  results?: ProcessedResult[]
  added?: ServerImage[]
}

export interface Capabilities {
  limits: { maxFileSizeMb: number; maxImages: number; maxImagePixels: number }
  accept: { images: string[]; logo: string[] }
  cardPresets: Record<string, { width: number; height: number; label: string }>
  referenceWidth: number
  labelFont: string
  /** Present when the server bundles a font it can also serve to the browser. */
  fontUrls: { bold?: string; regular?: string }
  /** Named font families a text element can opt into via `fontFamily`.
   * "default" mirrors labelFont/fontUrls above; "serif" is the Catalog
   * Composer's editorial face. */
  fonts?: Record<string, { label: string; urls: { bold?: string; regular?: string } }>
}

export interface ComposePayload {
  mode: 'image' | 'card'
  baseImageId?: string
  preset?: string
  width?: number
  height?: number
  background?: string
  transparent?: boolean
  name?: string
  elements: unknown[]
  export?: Record<string, unknown>
}

export interface ProcessPayload {
  order: string[]
  transforms: Record<string, ImageTransform>
  overlays: Record<string, unknown[]>
  logo: Record<string, unknown>
  character: Record<string, unknown>
  export: Record<string, unknown>
  sync?: boolean
}

function url(path: string): string {
  return path.startsWith('http') ? path : `${API_BASE}${path}`
}

async function parse<T>(response: Response): Promise<T> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiError(
      error?.message ?? 'The server could not complete that request.',
      error?.code ?? 'REQUEST_FAILED',
      response.status,
    )
  }
  return body as T
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url(path), init)
  } catch {
    throw new ApiError(
      'Could not reach the server. Check your connection and try again.',
      'NETWORK_ERROR',
    )
  }
  return parse<T>(response)
}

/** Multipart upload with progress, which fetch() cannot report. */
function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url(path))
    xhr.responseType = 'json'

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onerror = () =>
      reject(new ApiError('The upload failed. Check your connection.', 'NETWORK_ERROR'))
    xhr.ontimeout = () => reject(new ApiError('The upload timed out.', 'TIMEOUT'))
    xhr.onload = () => {
      const body = xhr.response as { error?: { code?: string; message?: string } } | null
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T)
        return
      }
      reject(
        new ApiError(
          body?.error?.message ?? 'The upload was rejected by the server.',
          body?.error?.code ?? 'UPLOAD_FAILED',
          xhr.status,
        ),
      )
    }
    xhr.send(form)
  })
}

export const api = {
  fileUrl(path: string): string {
    return url(path)
  },

  async health(): Promise<{ status: string; service: string }> {
    return request('/api/health')
  },

  async capabilities(): Promise<Capabilities> {
    return request('/api/capabilities')
  },

  async createJob(
    files: File[],
    logo?: File | null,
    onProgress?: (percent: number) => void,
  ): Promise<JobResponse> {
    const form = new FormData()
    files.forEach((file) => form.append('images', file, file.name))
    if (logo) form.append('logo', logo, logo.name)
    return uploadWithProgress<JobResponse>('/api/jobs', form, onProgress)
  },

  async addImages(
    jobId: string,
    files: File[],
    onProgress?: (percent: number) => void,
  ): Promise<JobResponse> {
    const form = new FormData()
    files.forEach((file) => form.append('images', file, file.name))
    return uploadWithProgress<JobResponse>(`/api/jobs/${jobId}/images`, form, onProgress)
  },

  async removeImage(jobId: string, imageId: string): Promise<JobResponse> {
    return request(`/api/jobs/${jobId}/images/${imageId}`, { method: 'DELETE' })
  },

  async uploadLogo(jobId: string, file: File): Promise<{ logo: ServerLogo }> {
    const form = new FormData()
    form.append('logo', file, file.name)
    return uploadWithProgress<{ logo: ServerLogo }>(`/api/jobs/${jobId}/logo`, form)
  },

  async clearLogo(jobId: string): Promise<void> {
    await request(`/api/jobs/${jobId}/logo`, { method: 'DELETE' })
  },

  async process(jobId: string, payload: ProcessPayload): Promise<JobStatus> {
    return request(`/api/jobs/${jobId}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },

  async status(jobId: string): Promise<JobResponse & { results: ProcessedResult[] }> {
    return request(`/api/jobs/${jobId}`)
  },

  async results(jobId: string): Promise<{
    results: ProcessedResult[]
    zipUrl: string
    status: JobStatus['status']
    completed: number
    failed: number
    total: number
  }> {
    return request(`/api/jobs/${jobId}/results`)
  },

  async compose(jobId: string, payload: ComposePayload): Promise<ComposeResult> {
    return request(`/api/jobs/${jobId}/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },

  composeUrl(jobId: string): string {
    return url(`/api/jobs/${jobId}/compose/file`)
  },

  zipUrl(jobId: string): string {
    return url(`/api/jobs/${jobId}/zip`)
  },

  async deleteJob(jobId: string): Promise<void> {
    await request(`/api/jobs/${jobId}`, { method: 'DELETE' })
  },
}
