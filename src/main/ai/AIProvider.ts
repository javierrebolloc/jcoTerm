export type LimitType = 'daily' | 'rpm' | 'tpm'

export interface QuotaInfo {
  remaining: number | null
  isEstimate: boolean
  resetAt?: string // ISO-8601 UTC
  limitType: LimitType
}

export interface AIProviderResponse {
  reply: string
  quotaInfo?: QuotaInfo
}

export interface AIStreamCallbacks {
  onChunk: (text: string) => void
  onEnd: (quotaInfo?: QuotaInfo) => void
  onError: (error: string) => void
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AIProvider {
  sendMessage(apiKey: string, userMessage: string, redactedContext: string, maxTokens?: number, history?: ChatHistoryMessage[]): Promise<AIProviderResponse>
  sendMessageStream(apiKey: string, userMessage: string, redactedContext: string, callbacks: AIStreamCallbacks, maxTokens?: number, history?: ChatHistoryMessage[]): Promise<void>
}
