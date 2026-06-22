export type RedactedPatternType =
  | 'pem'
  | 'auth_header'
  | 'bearer_token'
  | 'aws_key'
  | 'anthropic_key'
  | 'api_key'
  | 'github_token'
  | 'gitlab_token'
  | 'google_key'
  | 'password'
  | 'db_url'
  | 'env_var'

export interface RedactorResult {
  redacted: string
  count: number
  matchedTypes: RedactedPatternType[]
}

const PATTERNS: [RedactedPatternType, RegExp, string][] = [
  ['pem', /-----BEGIN [\w ]+ PRIVATE KEY-----[\s\S]*?-----END [\w ]+ PRIVATE KEY-----/g, '[CLAVE_PRIVADA]'],
  ['auth_header', /(Authorization:\s*(?:Bearer|Basic|Token)\s+)\S+/gi, '$1[TOKEN]'],
  ['bearer_token', /\b(Bearer|Token)\s+[A-Za-z0-9\-_.~+/]{20,}/g, '$1 [TOKEN]'],
  ['aws_key', /\b(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{12,}/g, '[AWS_KEY]'],
  ['anthropic_key', /sk-ant-[A-Za-z0-9\-_]{10,}/g, '[API_KEY_ANTHROPIC]'],
  ['api_key', /sk-(?:proj-)?[A-Za-z0-9\-_]{20,}/g, '[API_KEY]'],
  ['github_token', /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/g, '[GITHUB_TOKEN]'],
  ['gitlab_token', /\bglpat-[A-Za-z0-9\-_]{20,}/g, '[GITLAB_TOKEN]'],
  ['google_key', /\bAIza[A-Za-z0-9\-_]{30,}/g, '[GOOGLE_API_KEY]'],
  ['password', /(password|passwd|pwd)\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '$1=[CONTRASEÑA]'],
  ['db_url', /((?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?|redis|amqp|ftp|ssh):\/\/[^:@\s/]+:)[^@\s/]+(@)/gi, '$1[CONTRASEÑA]$2'],
  ['env_var', /\b((?:export\s+)?(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|APIKEY|ACCESS_KEY|PRIVATE_KEY|SECRET_KEY|AUTH_KEY|ENCRYPTION_KEY|DB_PASS|DATABASE_PASSWORD|ANTHROPIC_API_KEY|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|GEMINI_API_KEY|GCP_API_KEY)\s*=\s*)(?:"[^"]*"|'[^']*'|\S+)/g, '$1[REDACTADO]'],
]

export class Redactor {
  redact(text: string): RedactorResult {
    let result = text
    let count = 0
    const matchedTypes: RedactedPatternType[] = []

    for (const [type, pattern, replacement] of PATTERNS) {
      const matches = result.match(pattern)
      if (matches) {
        count += matches.length
        result = result.replace(pattern, replacement)
        if (!matchedTypes.includes(type)) matchedTypes.push(type)
      }
    }

    return { redacted: result, count, matchedTypes }
  }
}
