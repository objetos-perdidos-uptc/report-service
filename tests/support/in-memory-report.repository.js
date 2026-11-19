// Adaptador de prueba: implementa el MISMO puerto ReportRepository guardando en memoria.
// Demuestra la arquitectura hexagonal: los casos de uso funcionan igual sin PostgreSQL.
import { Photo } from '../../src/domain/photo.js'
import { ReportRepository } from '../../src/domain/ports.js'
import { Report } from '../../src/domain/report.js'
import { Location, PrivateFeature } from '../../src/domain/value-objects.js'

const SEARCHABLE = ['name', 'description', 'color', 'material', 'custodyLocation']

export class InMemoryReportRepository extends ReportRepository {
  #rows = new Map()
  #nextId = 1
  #nextPhotoId = 1
  #categories = [{ categoryId: 1, name: 'Electrónicos' }, { categoryId: 5, name: 'Mochilas y bolsos' }]

  #toDomain(row) {
    return new Report({
      ...row,
      location: Location.from(row.location),
      privateFeature: PrivateFeature.from(row.privateFeature),
      categoryName: this.#categories.find((c) => c.categoryId === row.categoryId)?.name ?? null,
      photos: row.photos.map((p) => new Photo(p)),
    })
  }

  #matches(row, { campusId, type, status, categoryId, userId, q }) {
    if (campusId != null && row.campusId !== campusId) return false
    if (type && row.type !== type) return false
    if (status && row.status !== status) return false
    if (categoryId != null && row.categoryId !== categoryId) return false
    if (userId != null && String(row.userId) !== String(userId)) return false
    if (q) {
      const text = [...SEARCHABLE.map((f) => row[f]), row.location?.textDirection].join(' ').toLowerCase()
      if (!text.includes(q.toLowerCase())) return false
    }
    return true
  }

  #sorted() {
    return [...this.#rows.values()].sort((a, b) => b.reportId - a.reportId)
  }

  async findById(reportId) {
    const row = this.#rows.get(reportId)
    return row ? this.#toDomain(row) : null
  }

  async save(report) {
    if (report.reportId == null) {
      report.reportId = this.#nextId++
      report.creationDate = new Date()
    }
    for (const photo of report.photos) {
      if (photo.photoId == null) {
        photo.photoId = this.#nextPhotoId++
        photo.createdAt = new Date()
      }
    }
    this.#rows.set(report.reportId, {
      ...report,
      location: report.location ? { ...report.location } : null,
      privateFeature: report.privateFeature?.value ?? null,
      photos: report.photos.map((p) => ({ ...p })),
    })
  }

  async findPage(filters, page, size) {
    const all = this.#sorted().filter((r) => this.#matches(r, filters))
    return { items: all.slice(page * size, (page + 1) * size).map((r) => this.#toDomain(r)), total: all.length }
  }

  async findAll(filters) {
    return this.#sorted().filter((r) => this.#matches(r, filters)).map((r) => this.#toDomain(r))
  }

  async findActiveByLastActivity({ before, after }) {
    return this.#sorted()
      .filter((r) => r.status === 'ACTIVE' && r.lastActivityDate < before && (!after || r.lastActivityDate >= after))
      .map((r) => this.#toDomain(r))
  }

  /** Solo para pruebas: simula que pasó el tiempo sin actividad. */
  age(reportId, days) {
    const row = this.#rows.get(reportId)
    row.lastActivityDate = new Date(row.lastActivityDate.getTime() - days * 86_400_000)
  }

  async countByStatus() {
    const counts = {}
    for (const row of this.#rows.values()) counts[row.status] = (counts[row.status] ?? 0) + 1
    return counts
  }

  async findCategories() { return this.#categories }

  async categoryExists(categoryId) { return this.#categories.some((c) => c.categoryId === categoryId) }
}
