// Agregado Report (DDD): concentra las reglas de negocio de un reporte de objeto perdido
// o encontrado. Nadie cambia su estado "por fuera": todo pasa por sus métodos, que validan
// las reglas y registran el evento de dominio correspondiente.
import { BusinessRuleError, ForbiddenError, ValidationError } from './errors.js'
import { createDomainEvent, ReportEvents } from './events.js'
import { Photo } from './photo.js'
import { CloseReason, Location, PrivateFeature, ReportStatus, ReportType } from './value-objects.js'

const EDITABLE = [
  'name', 'description', 'color', 'material', 'categoryId', 'location', 'privateFeature',
  'dateLost', 'reward', 'dateOfDiscovery', 'custodyLocation',
]
const ONLY_LOST = ['dateLost', 'reward']
const ONLY_FOUND = ['dateOfDiscovery', 'custodyLocation']

export class Report {
  #pendingEvents = []

  constructor(props) {
    this.reportId = props.reportId ?? null
    this.type = props.type
    this.status = props.status ?? ReportStatus.ACTIVE
    this.name = props.name
    this.description = props.description ?? null
    this.color = props.color ?? null
    this.material = props.material ?? null
    this.categoryId = props.categoryId
    this.categoryName = props.categoryName ?? null
    this.campusId = props.campusId
    this.userId = props.userId
    this.location = props.location ?? null
    this.privateFeature = props.privateFeature ?? null
    this.dateLost = props.dateLost ?? null
    this.reward = props.reward ?? null
    this.dateOfDiscovery = props.dateOfDiscovery ?? null
    this.custodyLocation = props.custodyLocation ?? null
    this.photos = props.photos ?? []
    this.creationDate = props.creationDate ?? null
    this.lastActivityDate = props.lastActivityDate ?? null
    this.closedAt = props.closedAt ?? null
    this.closeReason = props.closeReason ?? null
  }

  // ---------- Creación ----------

  /** HU-03 / HU-04: crea un reporte nuevo y registra el evento report.created. */
  static create(props, now = new Date()) {
    const type = ReportType.parse(props.type)
    const report = new Report({
      ...props,
      type,
      status: ReportStatus.ACTIVE,
      location: Location.from(props.location),
      privateFeature: PrivateFeature.from(props.privateFeature),
      photos: [],
      lastActivityDate: now,
      closedAt: null,
      closeReason: null,
    })
    report.#discardFieldsOfOtherType()
    report.#checkInvariants()
    report.#record(ReportEvents.CREATED, {}, now)
    return report
  }

  // ---------- Comportamiento ----------

  isOwnedBy(userId) {
    return String(this.userId) === String(userId)
  }

  assertOwnedBy(userId) {
    if (!this.isOwnedBy(userId)) throw new ForbiddenError('No es tu reporte')
  }

  isActive() {
    return this.status === ReportStatus.ACTIVE
  }

  /** HU-06: edita los datos del reporte. El tipo, el campus y el dueño no se pueden cambiar. */
  update(changes, now = new Date()) {
    this.#assertActive('Solo se pueden editar reportes activos')
    const fields = Object.keys(changes).filter((k) => EDITABLE.includes(k))
    if (fields.length === 0) throw new ValidationError('No se envió ningún campo para actualizar')

    for (const field of fields) {
      if (field === 'location') this.location = Location.from(changes.location)
      else if (field === 'privateFeature') this.privateFeature = PrivateFeature.from(changes.privateFeature)
      else this[field] = changes[field]
    }
    this.#discardFieldsOfOtherType()
    this.#checkInvariants()
    this.lastActivityDate = now
    this.#record(ReportEvents.UPDATED, { fields }, now)
  }

  /** HU-06 / HU-14: cierra el reporte (recuperado, cancelado...). */
  close(reason, now = new Date()) {
    this.#assertActive('El reporte ya no está activo')
    this.status = ReportStatus.CLOSED
    this.closeReason = CloseReason.parse(reason)
    this.closedAt = now
    this.#record(ReportEvents.CLOSED, { reason: this.closeReason }, now)
  }

  /** HU-16: el reporte pasa a EXPIRED por inactividad. */
  expire(now = new Date()) {
    this.#assertActive('Solo un reporte activo puede expirar')
    this.status = ReportStatus.EXPIRED
    this.closeReason = CloseReason.INACTIVITY
    this.closedAt = now
    this.#record(ReportEvents.EXPIRED, {}, now)
  }

  /** HU-25: renueva un reporte activo o expirado; reinicia el conteo de inactividad. */
  renew(now = new Date()) {
    if (this.status === ReportStatus.CLOSED) throw new BusinessRuleError('Un reporte cerrado no se puede renovar')
    this.status = ReportStatus.ACTIVE
    this.closeReason = null
    this.closedAt = null
    this.lastActivityDate = now
    this.#record(ReportEvents.RENEWED, {}, now)
  }

  /** HU-04: agrega fotos respetando el máximo permitido. */
  addPhotos(filenames, maxPhotos, now = new Date()) {
    this.#assertActive('Solo se pueden agregar fotos a reportes activos')
    if (filenames.length === 0) throw new ValidationError('Envía al menos una imagen en el campo "photos"')
    if (this.photos.length + filenames.length > maxPhotos) {
      throw new BusinessRuleError(`Un reporte admite máximo ${maxPhotos} fotos`)
    }
    this.photos.push(...filenames.map((f) => Photo.create(f)))
    this.lastActivityDate = now
    this.#record(ReportEvents.PHOTOS_CHANGED, { added: filenames.length }, now)
  }

  /** Quita una foto y la devuelve, para que el caso de uso borre el archivo. */
  removePhoto(photoId, now = new Date()) {
    const photo = this.photos.find((p) => p.photoId === photoId)
    if (!photo) return null
    this.photos = this.photos.filter((p) => p !== photo)
    this.#record(ReportEvents.PHOTOS_CHANGED, { removed: 1 }, now)
    return photo
  }

  /** HU-12: compara lo que dice el reclamante con la característica privada, sin revelarla. */
  matchesPrivateFeature(candidate) {
    return this.privateFeature !== null && this.privateFeature.matches(candidate)
  }

  isRecovered() {
    return this.status === ReportStatus.CLOSED && CloseReason.recovered.includes(this.closeReason)
  }

  // ---------- Eventos ----------

  /** Entrega los eventos pendientes y vacía la lista. Se llama después de guardar. */
  pullEvents() {
    const events = this.#pendingEvents.map(({ type, data, at }) => createDomainEvent(type, this.snapshot(), data, at))
    this.#pendingEvents = []
    return events
  }

  /** Copia plana del reporte SIN la característica privada (se usa en eventos y DTOs). */
  snapshot() {
    return {
      reportId: this.reportId,
      type: this.type,
      status: this.status,
      name: this.name,
      description: this.description,
      color: this.color,
      material: this.material,
      categoryId: this.categoryId,
      campusId: this.campusId,
      userId: Number(this.userId),
      location: this.location ? { ...this.location } : null,
      photos: this.photos.map((p) => p.url),
      creationDate: this.creationDate,
      dateLost: this.dateLost,
      reward: this.reward,
      dateOfDiscovery: this.dateOfDiscovery,
      custodyLocation: this.custodyLocation,
      lastActivityDate: this.lastActivityDate,
      closedAt: this.closedAt,
      closeReason: this.closeReason,
    }
  }

  // ---------- Reglas internas ----------

  #assertActive(message) {
    if (!this.isActive()) throw new BusinessRuleError(message)
  }

  #discardFieldsOfOtherType() {
    const other = this.type === ReportType.LOST ? ONLY_FOUND : ONLY_LOST
    for (const field of other) this[field] = null
  }

  #checkInvariants() {
    const errors = []
    if (!this.name) errors.push('name:es obligatorio')
    if (this.categoryId == null) errors.push('categoryId:es obligatorio')
    if (this.campusId == null) errors.push('campusId:es obligatorio')
    if (this.type === ReportType.LOST) {
      if (!this.privateFeature) errors.push('privateFeature:es obligatorio')
      if (!this.dateLost) errors.push('dateLost:es obligatorio')
    } else if (!this.dateOfDiscovery) {
      errors.push('dateOfDiscovery:es obligatorio')
    }
    if (errors.length) throw new ValidationError(errors.join(';'))
  }

  #record(type, data, at) {
    this.#pendingEvents.push({ type, data, at })
  }
}
