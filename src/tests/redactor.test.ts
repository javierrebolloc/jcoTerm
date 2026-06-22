import { describe, it, expect } from 'vitest'
import { Redactor } from '../shared/Redactor'

const r = new Redactor()

describe('Redactor', () => {
  it('leaves plain text unchanged', () => {
    const text = 'ls -la /var/log\ntotal 48\ndrwxr-xr-x  2 root root'
    expect(r.redact(text)).toEqual({ redacted: text, count: 0, matchedTypes: [] })
  })

  it('redacts PEM private key blocks', () => {
    const text = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4RqPBhHkMEFEMiSVfWoHdKTKjBc
-----END RSA PRIVATE KEY-----`
    const { redacted, count } = r.redact(text)
    expect(redacted).toBe('[CLAVE_PRIVADA]')
    expect(count).toBe(1)
  })

  it('redacts EC private key blocks', () => {
    const text = '-----BEGIN EC PRIVATE KEY-----\nabc123\n-----END EC PRIVATE KEY-----'
    const { redacted, count } = r.redact(text)
    expect(redacted).toBe('[CLAVE_PRIVADA]')
    expect(count).toBe(1)
  })

  it('redacts Authorization Bearer header', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature'
    const { redacted, count } = r.redact(text)
    expect(redacted).toBe('Authorization: Bearer [TOKEN]')
    expect(count).toBe(1)
  })

  it('redacts Authorization Basic header', () => {
    const { redacted } = r.redact('Authorization: Basic dXNlcjpwYXNz')
    expect(redacted).toBe('Authorization: Basic [TOKEN]')
  })

  it('redacts Anthropic API key', () => {
    const { redacted, count } = r.redact('export ANTHROPIC_API_KEY=sk-ant-api03-verylongsecretkey12345')
    expect(redacted).not.toContain('sk-ant-api03')
    expect(count).toBeGreaterThan(0)
  })

  it('redacts OpenAI-style API key', () => {
    const { redacted, count } = r.redact('curl -H "Authorization: Bearer sk-proj-abcdefghijklmnopqrstuvwxyz1234567890" https://api.openai.com')
    expect(redacted).not.toContain('sk-proj-abc')
    expect(count).toBeGreaterThan(0)
  })

  it('redacts password: value', () => {
    const { redacted, count } = r.redact('password: supersecret123')
    expect(redacted).toBe('password=[CONTRASEÑA]')
    expect(count).toBe(1)
  })

  it('redacts passwd= value', () => {
    const { redacted, count } = r.redact('passwd=abc123')
    expect(redacted).toBe('passwd=[CONTRASEÑA]')
    expect(count).toBe(1)
  })

  it('redacts database URL credentials', () => {
    const { redacted, count } = r.redact('postgres://admin:s3cr3t@localhost:5432/mydb')
    expect(redacted).toBe('postgres://admin:[CONTRASEÑA]@localhost:5432/mydb')
    expect(count).toBe(1)
  })

  it('redacts mysql URL credentials', () => {
    const { redacted } = r.redact('mysql://root:hunter2@db.example.com/prod')
    expect(redacted).toBe('mysql://root:[CONTRASEÑA]@db.example.com/prod')
  })

  it('redacts sensitive env var assignments', () => {
    const { redacted, count } = r.redact('PASSWORD=abc123xyz')
    // matches both the password-field pattern and the env-var pattern → count ≥ 1
    expect(redacted).not.toContain('abc123xyz')
    expect(count).toBeGreaterThanOrEqual(1)
  })

  it('redacts exported env vars', () => {
    const { redacted } = r.redact('export SECRET_KEY=my-very-secret-value')
    expect(redacted).toContain('[REDACTADO]')
    expect(redacted).not.toContain('my-very-secret-value')
  })

  it('redacts TOKEN env var', () => {
    const { redacted } = r.redact('TOKEN=ghp_someGithubToken12345')
    expect(redacted).toBe('TOKEN=[REDACTADO]')
  })

  it('counts multiple redactions across different patterns', () => {
    const text = [
      'password: hunter2',
      'Authorization: Bearer abc.def.ghi.jkl.mno.pqr.stu',
      'mysql://user:pass@host/db',
    ].join('\n')
    const { count } = r.redact(text)
    expect(count).toBeGreaterThanOrEqual(3)
  })

  it('returns count 0 when nothing to redact', () => {
    const { count } = r.redact('echo "hello world"\nls -la\npwd')
    expect(count).toBe(0)
  })
})
