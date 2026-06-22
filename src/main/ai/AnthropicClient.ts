import Anthropic from '@anthropic-ai/sdk'
import { log } from '../logger'
import type { AIProvider, AIProviderResponse, AIStreamCallbacks, ChatHistoryMessage } from './AIProvider'
import { t } from '../../shared/i18n'

const SYSTEM_PROMPT = `Eres un asistente de administración de sistemas experto en Linux/Unix y SSH.
Tienes acceso al contenido visible del terminal SSH del usuario (con secretos redactados).
Tu rol es exclusivamente de lectura: no puedes ni debes ejecutar comandos ni escribir en el terminal.
Responde de forma concisa y técnica. Si el usuario pregunta algo que no está relacionado con el contenido
del terminal, responde igualmente pero indica que no tienes contexto del terminal para esa pregunta.
Todos los secretos han sido redactados antes de llegar a ti; nunca pidas credenciales al usuario.`

function classifyAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return t('errors.ai.anthropicAuthFailed')
  }
  if (err instanceof Anthropic.RateLimitError) {
    return t('errors.ai.anthropicRateLimit')
  }
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529 || err.status === 503) {
      return t('errors.ai.anthropicOverloaded')
    }
    return t('errors.ai.anthropicApiError', { status: err.status })
  }
  if (err instanceof Error && err.message.includes('fetch')) {
    return t('errors.ai.anthropicNetworkError')
  }
  return t('errors.ai.anthropicGenericError')
}

function buildMessages(userMessage: string, redactedContext: string, history?: ChatHistoryMessage[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = []

  if (history && history.length > 0) {
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content })
    }
  }

  const userContent = redactedContext.trim()
    ? `Contenido actual del terminal (secretos redactados):\n\`\`\`\n${redactedContext}\n\`\`\`\n\nPregunta: ${userMessage}`
    : userMessage

  messages.push({ role: 'user', content: userContent })
  return messages
}

export class AnthropicClient implements AIProvider {
  constructor(private readonly model: string = 'claude-sonnet-4-6') {}

  async sendMessage(apiKey: string, userMessage: string, redactedContext: string, maxTokens: number = 1024, history?: ChatHistoryMessage[]): Promise<AIProviderResponse> {
    const client = new Anthropic({ apiKey })

    try {
      const response = await client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: buildMessages(userMessage, redactedContext, history),
      })

      const block = response.content[0]
      if (!block || block.type !== 'text') throw new Error('Empty response from API')
      return { reply: block.text }
    } catch (err) {
      log.error('[anthropic] Error:', (err as Error).message)
      throw new Error(classifyAnthropicError(err))
    }
  }

  async sendMessageStream(apiKey: string, userMessage: string, redactedContext: string, callbacks: AIStreamCallbacks, maxTokens: number = 1024, history?: ChatHistoryMessage[]): Promise<void> {
    const client = new Anthropic({ apiKey })

    try {
      const stream = client.messages.stream({
        model: this.model,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: buildMessages(userMessage, redactedContext, history),
      })

      stream.on('text', (text) => {
        callbacks.onChunk(text)
      })

      await stream.finalMessage()
      callbacks.onEnd()
    } catch (err) {
      log.error('[anthropic] Stream error:', (err as Error).message)
      callbacks.onError(classifyAnthropicError(err))
    }
  }
}
