import { log } from '../logger'
import type { AIProvider, AIProviderResponse, AIStreamCallbacks, ChatHistoryMessage, QuotaInfo, LimitType } from './AIProvider'
import { t } from '../../shared/i18n'

interface GeminiContent {
  role: 'user' | 'model'
  parts: { text: string }[]
}

function buildGeminiContents(userMessage: string, redactedContext: string, history?: ChatHistoryMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = []

  if (history && history.length > 0) {
    for (const msg of history) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      })
    }
  }

  const userContent = redactedContext.trim()
    ? `Contenido actual del terminal (secretos redactados):\n\`\`\`\n${redactedContext}\n\`\`\`\n\nPregunta: ${userMessage}`
    : userMessage

  contents.push({ role: 'user', parts: [{ text: userContent }] })
  return contents
}

const SYSTEM_PROMPT = `Eres un asistente de administración de sistemas experto en Linux/Unix y SSH.
Tienes acceso al contenido visible del terminal SSH del usuario (con secretos redactados).
Tu rol es exclusivamente de lectura: no puedes ni debes ejecutar comandos ni escribir en el terminal.
Responde de forma concisa y técnica. Si el usuario pregunta algo que no está relacionado con el contenido
del terminal, responde igualmente pero indica que no tienes contexto del terminal para esa pregunta.
Todos los secretos han sido redactados antes de llegar a ti; nunca pidas credenciales al usuario.`

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_RETRY_DELAYS_MS = [1000, 2000, 4000] as const

interface GeminiErrorDetail {
  '@type'?: string
  reason?: string
  metadata?: Record<string, string>
}

interface GeminiApiError {
  code: number
  message: string
  status: string
  details?: GeminiErrorDetail[]
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }>; role?: string }
    finishReason?: string
  }>
  error?: GeminiApiError
}

export class GeminiQuotaError extends Error {
  constructor(
    public readonly limitType: LimitType,
    public readonly resetAt?: string,
    message?: string,
  ) {
    super(message ?? t('errors.ai.geminiQuotaDaily', { resetHint: '' }))
    this.name = 'GeminiQuotaError'
  }
}

function tryParseInt(s: string | null): number | null {
  if (!s) return null
  const n = parseInt(s, 10)
  return isNaN(n) ? null : n
}

function parseQuotaHeaders(headers: Headers): { remaining: number | null; resetAt?: string } {
  const remaining =
    tryParseInt(headers.get('x-ratelimit-remaining')) ??
    tryParseInt(headers.get('x-ratelimit-remaining-requests')) ??
    null

  const resetRaw =
    headers.get('x-ratelimit-reset') ??
    headers.get('x-ratelimit-reset-requests') ??
    null

  let resetAt: string | undefined
  if (resetRaw) {
    const resetDate = /^\d+$/.test(resetRaw)
      ? new Date(parseInt(resetRaw, 10) * 1000)
      : new Date(resetRaw)
    if (!isNaN(resetDate.getTime()) && resetDate.getTime() > Date.now()) {
      resetAt = resetDate.toISOString()
    }
  }

  return { remaining, resetAt }
}

function detectLimitType(error: GeminiApiError): LimitType {
  const msg = (error.message ?? '').toLowerCase()
  const details = error.details ?? []

  // Free-tier request quota (checks request count before tokens — order matters)
  if (msg.includes('free_tier_requests') || msg.includes('requests_per_day')) return 'daily'
  if (msg.includes('per_minute') || msg.includes('per minute') || msg.includes('rpm')) return 'rpm'
  if (msg.includes('token') || msg.includes('tpm')) return 'tpm'

  for (const d of details) {
    const quotaId = (d.metadata?.['quotaId'] ?? d.metadata?.['quotaMetric'] ?? '').toLowerCase()
    if (quotaId.includes('free_tier_requests') || quotaId.includes('requests_per_day')) return 'daily'
    if (quotaId.includes('minute')) return 'rpm'
    if (quotaId.includes('token')) return 'tpm'
  }

  return 'daily'
}

const MAX_API_RETRY_DELAY_MS = 60_000

/**
 * Returns true when every quota violation in the error has limit: 0.
 * This means the API key's project has no quota allocated at all — retrying will never succeed.
 */
function isZeroQuotaKey(error: GeminiApiError): boolean {
  const msg = error.message ?? ''
  return /limit: 0/i.test(msg) && !/limit: [1-9]/i.test(msg)
}

/** Reads the API-suggested retry delay from the Retry-After header or "Please retry in Xs" pattern. */
function parseRetryAfterMs(message: string, headers: Headers): number | null {
  const header = headers.get('Retry-After') ?? headers.get('retry-after')
  if (header) {
    const secs = parseFloat(header)
    if (!isNaN(secs) && secs > 0) return Math.min(Math.ceil(secs * 1000), MAX_API_RETRY_DELAY_MS)
  }

  const match = /please retry in ([0-9.]+)\s*s/i.exec(message)
  if (match?.[1]) {
    const secs = parseFloat(match[1])
    if (!isNaN(secs) && secs > 0) return Math.min(Math.ceil(secs * 1000), MAX_API_RETRY_DELAY_MS)
  }

  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class GeminiClient implements AIProvider {
  constructor(
    private readonly model: string = 'gemini-2.5-flash-lite',
    /** Delays between retries in ms. Injectable for tests (pass [0,0,0] to skip waits). */
    private readonly retryDelays: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
  ) {}

  async sendMessage(apiKey: string, userMessage: string, redactedContext: string, maxTokens: number = 1024, history?: ChatHistoryMessage[]): Promise<AIProviderResponse> {
    const url = `${BASE_URL}/${this.model}:generateContent?key=${apiKey}`
    const maxRetries = this.retryDelays.length

    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: buildGeminiContents(userMessage, redactedContext, history),
      generationConfig: { maxOutputTokens: maxTokens },
    })

    let nextRetryDelayMs: number | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const defaultDelay = this.retryDelays[attempt - 1] ?? this.retryDelays[this.retryDelays.length - 1]
        const delay = nextRetryDelayMs ?? defaultDelay
        log.warn(`[gemini] Reintento ${attempt}/${maxRetries} en ${Math.round(delay / 1000)}s...`)
        await sleep(delay)
        nextRetryDelayMs = null
      }

      const response = await globalThis.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })

      if (response.ok) {
        const data = (await response.json()) as GeminiApiResponse
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) throw new Error(t('errors.ai.geminiEmptyResponse'))

        const { remaining, resetAt } = parseQuotaHeaders(response.headers)
        const quotaInfo: QuotaInfo | undefined =
          remaining !== null
            ? { remaining, isEstimate: false, resetAt, limitType: 'daily' }
            : undefined

        log.info(`[gemini] OK (modelo: ${this.model})${remaining !== null ? `, cuota restante: ${remaining}` : ''}`)
        return { reply: text, quotaInfo }
      }

      if (response.status === 429) {
        const data = (await response.json().catch(() => ({}))) as GeminiApiResponse
        const apiError = data.error ?? { code: 429, message: '', status: 'RESOURCE_EXHAUSTED' }
        const limitType = detectLimitType(apiError)

        log.warn(
          `[gemini] 429 intento ${attempt + 1}/${maxRetries + 1} (${limitType}): ${apiError.message}`,
        )
        log.debug('[gemini] Error 429 details: code=%d status=%s details=%s',
          apiError.code, apiError.status, JSON.stringify(apiError.details ?? []))

        const zeroQuota = isZeroQuotaKey(apiError)
        if (attempt < maxRetries && !zeroQuota) {
          const suggested = parseRetryAfterMs(apiError.message, response.headers)
          if (suggested) {
            log.warn(`[gemini] API sugiere esperar ${Math.round(suggested / 1000)}s`)
            nextRetryDelayMs = suggested
          }
          continue
        }

        // All retries exhausted (or zero-quota key — no point retrying)
        const { resetAt } = parseQuotaHeaders(response.headers)
        if (zeroQuota) {
          log.warn('[gemini] La clave API tiene cuota 0 en todos los limites — verifica la configuracion del proyecto en Google AI Studio')
        } else {
          log.warn(`[gemini] Cuota agotada (${limitType}) tras ${maxRetries + 1} intentos`)
        }
        throw new GeminiQuotaError(limitType, resetAt, apiError.message)
      }

      // Transient server errors: retry with backoff
      if ((response.status === 500 || response.status === 503) && attempt < maxRetries) {
        log.warn(`[gemini] HTTP ${response.status} intento ${attempt + 1}/${maxRetries + 1}, reintentando...`)
        continue
      }

      const data = (await response.json().catch(() => ({}))) as GeminiApiResponse
      const msg = data.error?.message ?? `HTTP ${response.status}`
      log.error(`[gemini] Error HTTP ${response.status}: ${msg}`)
      log.debug('[gemini] Error details: code=%d status=%s',
        data.error?.code ?? response.status, data.error?.status ?? 'unknown')
      throw new Error(msg)
    }

    // TypeScript requires a return path; the loop above always returns or throws
    throw new Error(t('errors.ai.geminiRetryLoopError'))
  }

  async sendMessageStream(apiKey: string, userMessage: string, redactedContext: string, callbacks: AIStreamCallbacks, maxTokens: number = 1024, history?: ChatHistoryMessage[]): Promise<void> {
    const url = `${BASE_URL}/${this.model}:streamGenerateContent?alt=sse&key=${apiKey}`

    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: buildGeminiContents(userMessage, redactedContext, history),
      generationConfig: { maxOutputTokens: maxTokens },
    })

    try {
      const response = await globalThis.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as GeminiApiResponse
        if (response.status === 429) {
          const apiError = data.error ?? { code: 429, message: '', status: 'RESOURCE_EXHAUSTED' }
          const limitType = detectLimitType(apiError)
          callbacks.onError(t('errors.ai.geminiStreamLimit', { limitType }))
          return
        }
        callbacks.onError(data.error?.message ?? `HTTP ${response.status}`)
        return
      }

      if (!response.body) {
        callbacks.onError(t('errors.ai.geminiNoStreamBody'))
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue
          try {
            const chunk = JSON.parse(jsonStr) as GeminiApiResponse
            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) callbacks.onChunk(text)
          } catch {
            // skip malformed chunks
          }
        }
      }

      const { remaining, resetAt } = parseQuotaHeaders(response.headers)
      const quotaInfo: QuotaInfo | undefined =
        remaining !== null
          ? { remaining, isEstimate: false, resetAt, limitType: 'daily' }
          : undefined

      log.info(`[gemini] Stream OK (modelo: ${this.model})`)
      callbacks.onEnd(quotaInfo)
    } catch (err) {
      log.error('[gemini] Stream error:', (err as Error).message)
      callbacks.onError((err as Error).message)
    }
  }
}
