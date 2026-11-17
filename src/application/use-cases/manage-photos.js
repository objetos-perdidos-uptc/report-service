import { NotFoundError } from '../../domain/errors.js'
import { commit, loadReport, parseId } from './shared.js'

/** HU-04: el dueño adjunta fotos (los archivos ya llegaron al almacenamiento). */
export class AddReportPhotos {
  constructor({ reports, events, storage, maxPhotos }) {
    this.deps = { reports, events }
    this.storage = storage
    this.maxPhotos = maxPhotos
  }

  async execute({ reportId, userId, filenames }) {
    try {
      const report = await loadReport(this.deps.reports, reportId)
      report.assertOwnedBy(userId)
      report.addPhotos(filenames, this.maxPhotos)
      return await commit(this.deps, report)
    } catch (e) {
      await Promise.all(filenames.map((f) => this.storage.remove(f)))   // no dejar archivos huérfanos
      throw e
    }
  }
}

export class RemoveReportPhoto {
  constructor({ reports, events, storage }) {
    this.deps = { reports, events }
    this.storage = storage
  }

  async execute({ reportId, userId, photoId }) {
    const report = await loadReport(this.deps.reports, reportId)
    report.assertOwnedBy(userId)
    const photo = report.removePhoto(parseId(photoId, 'photoId'))
    if (!photo) throw new NotFoundError('Foto no encontrada')
    await commit(this.deps, report)
    await this.storage.remove(photo.filename)
  }
}
