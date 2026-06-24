import { ipcMain, WebContents } from 'electron'
import { log } from '../logger'
import { IPC } from '../../shared/ipc-channels'
import type { AiMessageRequest, AiMessageResponse, IpcResult, QuotaInfo } from '../../shared/types'
import type { CredentialStore } from '../storage/CredentialStore'
import type { SettingsStore } from '../storage/SettingsStore'
import { Redactor } from '../../shared/Redactor'
import { AnthropicClient } from '../ai/AnthropicClient'
import { GeminiClient } from '../ai/GeminiClient'
import { IpcRateLimiter } from '../security'
import { t } from '../../shared/i18n'

const redactor = new Redactor()
const aiLimiter = new IpcRateLimiter(20, 60_000)

function calculateMaxTokens(contextLength: number): number {
  return Math.min(4096, Math.max(1024, 1024 + Math.floor(contextLength / 8)))
}

function getApiKey(
  credentialStore: CredentialStore,
  credentialId: string,
  providerLabel: string,
): IpcResult<string> | string {
  const credential = credentialStore.getCredential(credentialId)
  if (!credential || credential.type !== 'password') {
    return { success: false, error: t('errors.ai.keyNotConfigured', { provider: providerLabel }) }
  }
  return credential.password
}

export function registerAiHandlers(credentialStore: CredentialStore, settingsStore: SettingsStore): void {
  ipcMain.handle(
    IPC.AI.SEND_MESSAGE,
    async (event, req: AiMessageRequest): Promise<IpcResult<AiMessageResponse>> => {
      const sender: WebContents = event.sender

      if (!aiLimiter.check()) {
        return { success: false, error: t('errors.ai.tooManyRequests') }
      }

      try {
        const MAX_MESSAGE_LENGTH = 10_000
        if (!req.userMessage || typeof req.userMessage !== 'string') {
          return { success: false, error: t('errors.ai.emptyMessage') }
        }
        if (req.userMessage.length > MAX_MESSAGE_LENGTH) {
          return { success: false, error: t('errors.ai.messageTooLong', { limit: MAX_MESSAGE_LENGTH }) }
        }

        const settings = settingsStore.get()
        const { redacted, count, matchedTypes } = redactor.redact(req.terminalSnapshot ?? '')
        if (count > 0) {
          log.info(`[ai] Redacted ${count} secret(s) [${matchedTypes.join(', ')}], provider: ${settings.aiProvider}`)
        } else {
          log.info(`[ai] No secrets redacted, provider: ${settings.aiProvider}`)
        }

        const maxTokens = calculateMaxTokens(redacted.length)

        const sendChunk = (text: string): void => {
          if (!sender.isDestroyed()) sender.send(IPC.AI.STREAM_CHUNK, text)
        }
        const sendEnd = (quotaInfo?: QuotaInfo): void => {
          if (!sender.isDestroyed()) sender.send(IPC.AI.STREAM_END, { quotaInfo })
        }
        const sendError = (error: string): void => {
          if (!sender.isDestroyed()) sender.send(IPC.AI.STREAM_ERROR, error)
        }

        // ── Gemini ──────────────────────────────────────────────────────────
        if (settings.aiProvider === 'gemini') {
          const keyOrError = getApiKey(credentialStore, '__gemini_api_key__', 'Gemini')
          if (typeof keyOrError !== 'string') return keyOrError as IpcResult<AiMessageResponse>

          const geminiClient = new GeminiClient(settings.geminiModel)

          // Start streaming in background, return immediately
          void geminiClient.sendMessageStream(keyOrError, req.userMessage, redacted, {
            onChunk: sendChunk,
            onEnd: (quotaInfo) => {
              log.info('[ai] Stream de Gemini completado')
              sendEnd(quotaInfo)
            },
            onError: (error) => {
              log.error('[ai] Stream error Gemini:', error)
              sendError(t('errors.ai.contactError', { error: 'Gemini stream error' }))
            },
          }, maxTokens, req.history)

          return { success: true, data: { reply: '', redactedContext: redacted } }
        }

        // ── Anthropic ────────────────────────────────────────────────────────
        const keyOrError = getApiKey(credentialStore, '__anthropic_api_key__', 'Anthropic')
        if (typeof keyOrError !== 'string') return keyOrError as IpcResult<AiMessageResponse>

        const anthropicClient = new AnthropicClient(settings.anthropicModel)

        // Start streaming in background, return immediately
        void anthropicClient.sendMessageStream(keyOrError, req.userMessage, redacted, {
          onChunk: sendChunk,
          onEnd: () => {
            log.info('[ai] Stream de Anthropic completado')
            sendEnd()
          },
          onError: (error) => {
            log.error('[ai] Stream error Anthropic:', error)
            sendError(t('errors.ai.contactError', { error: 'Anthropic stream error' }))
          },
        }, maxTokens, req.history)

        return { success: true, data: { reply: '', redactedContext: redacted } }
      } catch (err) {
        const message = (err as Error).message
        log.error('[ai] Error:', message)
        return { success: false, error: t('errors.ai.contactError', { error: message }) }
      }
    },
  )
}
