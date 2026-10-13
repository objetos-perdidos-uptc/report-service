// DTOs del servicio: validan lo que entra y definen qué campos salen hacia cada consumidor.
import { config } from '../config.js'
import { HttpError } from '../middlewares/error.js'
import { REPORT_TYPES } from '../models/index.js'

const DAY_MS = 86_400_000

/** Acumula errores con el mismo formato que claim-service: "campo:mensaje;campo:mensaje". */
class Validator {
  errors = []

  fail(field, message) { this.errors.push(`${field}:${message}`) }

  text(value, field, { required = false, max = 255 } = {}) {
    if (value === undefined || value === null || String(value).trim() === '') {
      if (required) this.fail(field, 'es obligatorio')
      return null
    }
    const text = String(value).trim()
    if (text.length > max) this.fail(field, `máximo ${max} caracteres`)
    return text
  }

  integer(value, field, { required = false } = {}) {
    if (value === undefined || value === null || value === '') {
      if (required) this.fail(field, 'es obligatorio')
      return null
    }
    const n = Number(value)
    if (!Number.isInteger(n) || n < 0) this.fail(field, 'debe ser un entero positivo')
    return n
  }

  number(value, field, { min = -Infinity, max = Infinity } = {}) {
    if (value === undefined || value === null || value === '') return null
    const n = Number(value)
    if (Number.isNaN(n) || n < min || n > max) this.fail(field, 'valor numérico inválido')
    return n
  }

  date(value, field, { required = false } = {}) {
    if (value === undefined || value === null || value === '') {
      if (required) this.fail(field, 'es obligatorio')
      return null
    }
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) this.fail(field, 'fecha inválida')
    else if (d.getTime() > Date.now() + DAY_MS) this.fail(field, 'no puede ser una fecha futura')
    return d
  }

  check() {
    if (this.errors.length) throw new HttpError(400, this.errors.join(';'))
  }
}

/** Campos comunes a crear y actualizar. `partial` = solo valida los que vienen en el body. */
function readFields(v, body, type, partial) {
  const has = (k) => !partial || body[k] !== undefined
  const data = {}

  if (has('name')) data.name = v.text(body.name, 'name', { required: true, max: 120 })
  if (has('description')) data.description = v.text(body.description, 'description', { max: 2000 })
  if (has('color')) data.color = v.text(body.color, 'color', { max: 60 })
  if (has('material')) data.material = v.text(body.material, 'material', { max: 60 })
  if (has('categoryId')) data.categoryId = v.integer(body.categoryId, 'categoryId', { required: true })

  if (has('location')) {
    const loc = body.location ?? {}
    data.latitude = v.number(loc.latitude, 'location.latitude', { min: -90, max: 90 })
    data.longitude = v.number(loc.longitude, 'location.longitude', { min: -180, max: 180 })
    data.textDirection = v.text(loc.textDirection, 'location.textDirection')
    if ((data.latitude === null) !== (data.longitude === null)) {
      v.fail('location', 'latitude y longitude deben ir juntas')
    }
  }

  // Obligatoria al reportar una pérdida (HU-03). Quien encuentra algo puede guardar un detalle
  // no visible para que claim-service valide al reclamante (HU-12).
  if (has('privateFeature')) {
    data.privateFeature = v.text(body.privateFeature, 'privateFeature', { required: type === 'LOST' })
  }

  if (type === 'LOST') {
    if (has('dateLost')) data.dateLost = v.date(body.dateLost, 'dateLost', { required: true })
    if (has('reward')) data.reward = v.number(body.reward, 'reward', { min: 0 })
  } else if (type === 'FOUND') {
    if (has('dateOfDiscovery')) {
      data.dateOfDiscovery = v.date(body.dateOfDiscovery, 'dateOfDiscovery', { required: true })
    }
    if (has('custodyLocation')) data.custodyLocation = v.text(body.custodyLocation, 'custodyLocation')
  }
  return data
}

/** CreateReportRequest -> datos para persistir. El dueño y el campus salen del token, no del body. */
export function fromCreateRequest(body = {}, user) {
  const v = new Validator()
  const type = String(body.type ?? '').toUpperCase()
  if (!REPORT_TYPES.includes(type)) v.fail('type', 'debe ser LOST o FOUND')

  const campusId = user.campusId ?? v.integer(body.campusId, 'campusId', { required: true })
  const data = readFields(v, body, type, false)
  v.check()
  return { ...data, type, campusId, userId: user.id }
}

/** UpdateReportRequest -> solo los campos enviados. El tipo y el campus no se pueden cambiar. */
export function fromUpdateRequest(body = {}, type) {
  const v = new Validator()
  const data = readFields(v, body, type, true)
  v.check()
  if (Object.keys(data).length === 0) throw new HttpError(400, 'No se envió ningún campo para actualizar')
  return data
}

export function expirationDate(report) {
  return new Date(new Date(report.lastActivityDate).getTime() + config.expirationDays * DAY_MS)
}

/** Campos que comparten todos los DTO de salida (mismos nombres que el ReportDTO de matching-service). */
function base(report) {
  const hasLocation = report.latitude !== null && report.longitude !== null
  return {
    reportId: report.reportId,
    type: report.type,
    status: report.status,
    name: report.name,
    description: report.description,
    color: report.color,
    material: report.material,
    categoryId: report.categoryId,
    campusId: report.campusId,
    location: hasLocation || report.textDirection
      ? { latitude: report.latitude, longitude: report.longitude, textDirection: report.textDirection }
      : null,
    photos: (report.photos ?? []).map((p) => p.url),
    creationDate: report.creationDate,
    dateLost: report.dateLost,
    reward: report.reward,
    dateOfDiscovery: report.dateOfDiscovery,
    custodyLocation: report.custodyLocation,
  }
}

/** Lo que ve el frontend. La característica privada solo la ve el dueño (HU-03). */
export function toPublicDTO(report, viewerId) {
  const isOwner = String(report.userId) === String(viewerId)
  return {
    ...base(report),
    categoryName: report.category?.name ?? null,
    isOwner,
    lastActivityDate: report.lastActivityDate,
    expirationDate: report.status === 'ACTIVE' ? expirationDate(report) : null,
    closedAt: report.closedAt,
    closeReason: report.closeReason,
    ...(isOwner ? { privateFeature: report.privateFeature } : {}),
  }
}

/** Lo que consumen los otros microservicios por /internal. Nunca incluye la característica privada. */
export function toInternalDTO(report) {
  return {
    ...base(report),
    userId: Number(report.userId),
    lastActivityDate: report.lastActivityDate,
    expirationDate: expirationDate(report),
    closedAt: report.closedAt,
    closeReason: report.closeReason,
  }
}

export function toPageDTO({ rows, count }, page, size, mapper) {
  return {
    content: rows.map(mapper),
    page,
    size,
    totalElements: count,
    totalPages: Math.ceil(count / size),
  }
}

/** Para comparar la característica privada sin importar mayúsculas, tildes ni espacios. */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}
