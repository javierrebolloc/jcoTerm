import path from 'path'
import type { SavedFolder } from '../../shared/types'
import { JsonFileStore } from './JsonFileStore'

export class FolderStore extends JsonFileStore<SavedFolder> {
  constructor(sessionsDir: string) {
    super(path.join(sessionsDir, 'folders.json'))
  }
}
