import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import { SshSession } from '../main/ssh/SshSession'
import type { SshConnectConfig } from '../main/ssh/SshSession'

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockStream(): {
  on: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  setWindow: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  stderr: { on: ReturnType<typeof vi.fn> }
  emit: (event: string, ...args: unknown[]) => void
} {
  const emitter = new EventEmitter()
  return {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => emitter.on(event, cb)),
    once: vi.fn((event: string, cb: (...args: unknown[]) => void) => emitter.once(event, cb)),
    write: vi.fn().mockReturnValue(true),
    setWindow: vi.fn(),
    close: vi.fn(),
    stderr: { on: vi.fn() },
    emit: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
  }
}

function makeMockClient(): {
  client: EventEmitter & { connect: ReturnType<typeof vi.fn>; shell: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  stream: ReturnType<typeof makeMockStream>
} {
  const stream = makeMockStream()
  const client = new EventEmitter() as EventEmitter & {
    connect: ReturnType<typeof vi.fn>
    shell: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
  }
  client.connect = vi.fn()
  client.shell = vi.fn((_opts: unknown, cb: (err: null, s: typeof stream) => void) => {
    cb(null, stream)
  })
  client.end = vi.fn()
  return { client, stream }
}

const PASSWORD_CONFIG: SshConnectConfig = {
  host: 'test.host',
  port: 22,
  username: 'user',
  authMethod: 'password',
  password: 'secret',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SshSession', () => {
  let session: SshSession
  let mockClient: ReturnType<typeof makeMockClient>['client']
  let mockStream: ReturnType<typeof makeMockStream>

  beforeEach(() => {
    const m = makeMockClient()
    mockClient = m.client
    mockStream = m.stream
    session = new SshSession('test-uuid-1234', () => mockClient as never)
  })

  describe('connect()', () => {
    it('resolves when client emits ready and shell opens', async () => {
      const connectPromise = session.connect(PASSWORD_CONFIG)
      mockClient.emit('ready')
      await connectPromise
      expect(session.connected).toBe(true)
    })

    it('rejects when client emits error', async () => {
      const connectPromise = session.connect(PASSWORD_CONFIG)
      mockClient.emit('error', new Error('Connection refused'))
      await expect(connectPromise).rejects.toThrow('SSH error: Connection refused')
    })

    it('uses password auth when authMethod is password', async () => {
      const connectPromise = session.connect(PASSWORD_CONFIG)
      mockClient.emit('ready')
      await connectPromise
      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({ password: 'secret', username: 'user', host: 'test.host' }),
      )
    })

    it('uses privateKey auth when authMethod is privateKey', async () => {
      const keyConfig: SshConnectConfig = {
        host: 'test.host',
        port: 22,
        username: 'user',
        authMethod: 'privateKey',
        privateKey: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----',
      }
      const connectPromise = session.connect(keyConfig)
      mockClient.emit('ready')
      await connectPromise
      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({ privateKey: keyConfig.privateKey }),
      )
      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.not.objectContaining({ password: expect.anything() }),
      )
    })
  })

  describe('write()', () => {
    it('forwards data to the stream when connected', async () => {
      const connectPromise = session.connect(PASSWORD_CONFIG)
      mockClient.emit('ready')
      await connectPromise

      session.write('ls -la\r')
      expect(mockStream.write).toHaveBeenCalledWith('ls -la\r')
    })

    it('does nothing when not connected', () => {
      session.write('ignored')
      expect(mockStream.write).not.toHaveBeenCalled()
    })
  })

  describe('resize()', () => {
    it('calls setWindow with rows then cols', async () => {
      const connectPromise = session.connect(PASSWORD_CONFIG)
      mockClient.emit('ready')
      await connectPromise

      session.resize(120, 40)
      // ssh2 setWindow(rows, cols, height, width)
      expect(mockStream.setWindow).toHaveBeenCalledWith(40, 120, 0, 0)
    })

    it('does nothing when not connected', () => {
      session.resize(80, 24)
      expect(mockStream.setWindow).not.toHaveBeenCalled()
    })
  })

  describe('output event', () => {
    it('emits output event with sessionId and data when stream receives data', async () => {
      const connectPromise = session.connect(PASSWORD_CONFIG)
      mockClient.emit('ready')
      await connectPromise

      const received: Array<{ sessionId: string; data: string }> = []
      session.on('output', (payload: { sessionId: string; data: string }) => {
        received.push(payload)
      })

      // Simulate data from the SSH server
      mockStream.emit('data', Buffer.from('$ hello\r\n'))

      expect(received).toHaveLength(1)
      expect(received[0]).toEqual({ sessionId: 'test-uuid-1234', data: '$ hello\r\n' })
    })
  })

  describe('disconnect()', () => {
    it('closes the stream and calls client.end', async () => {
      const connectPromise = session.connect(PASSWORD_CONFIG)
      mockClient.emit('ready')
      await connectPromise

      session.disconnect()
      expect(mockStream.close).toHaveBeenCalled()
      expect(mockClient.end).toHaveBeenCalled()
      expect(session.connected).toBe(false)
    })
  })
})
