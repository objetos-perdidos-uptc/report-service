// Adaptador de almacenamiento: implementa el puerto PhotoStorage guardando las fotos en disco.
import fs from 'node:fs/promises'
import path from 'node:path'
import { PhotoStorage } from '../../domain/ports.js'

export class LocalPhotoStorage extends PhotoStorage {
  constructor(directory) {
    super()
    this.directory = path.resolve(directory)
  }

  async remove(filename) {
    await fs.rm(path.join(this.directory, path.basename(filename)), { force: true })
  }
}
