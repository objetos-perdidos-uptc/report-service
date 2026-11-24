// DTOs: traducen lo que llega por la API a comandos para los casos de uso (validando FORMATO)
// y el agregado Report a lo que ve cada consumidor. Las reglas de NEGOCIO viven en el dominio.
import { ValidationError } from '../../domain/errors.js'

const DAY_MS = 86_400_000

/** Acumula errores con el mismo formato que claim-service: "campo:mensaje;campo:mensaje". */
class Validator {
  errors = []

  fail(field, message) { this.errors.push(`${field}:${message}`) }

  text(value, field, max = 255) {
    if (value === undefined || value === null || String(value).trim() === '') return null
    const text = String(value).trim()
    if (text.length > max) this.fail(field, `máximo ${max} caracteres`)
    return text
  }

  integer(value, field) {
    if (value === undefined || value === null || value === '') return null
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

  date(value, field) {
    if (value === undefined || value === null || value === '') return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) this.fail(field, 'fecha inválida')
    else if (d.getTime() > Date.now() + DAY_MS) this.fail(field, 'no puede ser una fecha futura')
    return d
  }

  check() {
    if (this.errors.length) throw new ValidationError(this.errors.join(';'))
  }
}

const PARSERS = {
  name: (v, b) => v.text(b.name, 'name', 120),
  description: (v, b) => v.text(b.description, 'description', 2000),
  color: (v, b) => v.text(b.color, 'color', 60),
  material: (v, b) => v.text(b.material, 'material', 60),
  categoryId: (v, b) => v.integer(b.categoryId, 'categoryId'),
  privateFeature: (v, b) => v.text(b.privateFeature, 'privateFeature'),
  dateLost: (v, b) => v.date(b.dateLost, 'dateLost'),
  reward: (v, b) => v.number(b.reward, 'reward', { min: 0 }),
  dateOfDiscovery: (v, b) => v.date(b.dateOfDiscovery, 'dateOfDiscovery'),
  custodyLocation: (v, b) => v.text(b.custodyLocation, 'custodyLocation'),
  location: (v, b) => {
    const loc = b.location ?? {}
    return {
      latitude: v.number(loc.latitude, 'location.latitude', { min: -90, max: 90 }),
      longitude: v.number(loc.longitude, 'location.longitude', { min: -180, max: 180 }),
      textDirection: v.text(loc.textDirection, 'location.textDirection'),
    }
  },
}

function parse(body, fields) {
  const v = new Validator()
  const data = Object.fromEntries(fields.map((f) => [f, PARSERS[f](v, body)]))
  v.check()
  return data
}

/** CreateReportRequest -> comando CreateReport. El dueño y el campus salen del token, no del body. */
export function fromCreateRequest(body = {}, user) {
  const v = new Validator()
  const data = Object.fromEntries(Object.keys(PARSERS).map((f) => [f, PARSERS[f](v, body)]))
  const campusId = user.campusId ?? v.integer(body.campusId, 'campusId')
  v.check()
  return { ...data, type: body.type, campusId, userId: user.id }
}

/** UpdateReportRequest -> solo los campos enviados. */
export function fromUpdateRequest(body = {}) {
  return parse(body, Object.keys(PARSERS).filter((f) => body[f] !== undefined))
}

/** Lo que ve el frontend. La característica privada solo la ve el dueño (HU-03); el userId nunca. */
export function toPublicDTO(report, viewerId, policy) {
  const { userId, ...data } = report.snapshot()
  const isOwner = report.isOwnedBy(viewerId)
  return {
    ...data,
    categoryName: report.categoryName,
    isOwner,
    expirationDate: report.isActive() ? policy.expiresAt(report.lastActivityDate) : null,
    ...(isOwner ? { privateFeature: report.privateFeature?.value ?? null } : {}),
  }
}

/** Lo que consumen los otros microservicios por /internal. Nunca incluye la característica privada. */
export function toInternalDTO(report, policy) {
  return { ...report.snapshot(), expirationDate: policy.expiresAt(report.lastActivityDate) }
}

/**
 * Contrato de matching-service (`ReportSchema` de FastAPI, en snake_case). Es una capa
 * anticorrupción: el dominio no cambia; solo se traduce al formato que el otro servicio espera.
 * - `location` solo va si hay latitud y longitud (Pydantic las exige como float).
 * - `location_text` lleva el lugar escrito por el usuario (no manejamos mapa).
 */
export function toMatchingDTO(report) {
  const s = report.snapshot()
  const loc = s.location
  const hasCoords = loc?.latitude != null && loc?.longitude != null
  return {
    report_id: Number(s.reportId),
    user_id: Number(s.userId),
    report_type: s.type,
    name: s.name,
    description: s.description ?? '',
    category_id: Number(s.categoryId),
    campus_id: Number(s.campusId),
    color: s.color ?? null,
    material: s.material ?? null,
    date_lost: s.dateLost ?? null,
    date_found: s.dateOfDiscovery ?? null,
    location: hasCoords ? { latitude: Number(loc.latitude), longitude: Number(loc.longitude) } : null,
    location_text: loc?.textDirection ?? null,
  }
}

export function toPageDTO({ items, total }, page, size, mapper) {
  return {
    content: items.map(mapper),
    page,
    size,
    totalElements: total,
    totalPages: Math.ceil(total / size),
  }
}
