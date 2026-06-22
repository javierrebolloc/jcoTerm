import path from 'path'
import type { NamedCredential } from '../../shared/types'
import { JsonFileStore } from './JsonFileStore'

export class NamedCredentialStore extends JsonFileStore<NamedCredential> {
  constructor(sessionsDir: string) {
    super(path.join(sessionsDir, 'named-credentials.json'))
  }
}
