import { SshSession } from './SshSession'

export class SshManager {
  private sessions = new Map<string, SshSession>()

  createSession(id: string): SshSession {
    const session = new SshSession(id)
    this.sessions.set(id, session)
    return session
  }

  getSession(id: string): SshSession | undefined {
    return this.sessions.get(id)
  }

  removeSession(id: string): void {
    const session = this.sessions.get(id)
    if (session) {
      if (session.connected) session.disconnect()
      this.sessions.delete(id)
    }
  }

  closeAll(): void {
    for (const [id] of this.sessions) {
      this.removeSession(id)
    }
  }

  get activeCount(): number {
    return this.sessions.size
  }
}
