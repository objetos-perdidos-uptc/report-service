// Value Objects: se definen por su valor, son inmutables y se validan al crearse.
import { ValidationError } from './errors.js'

function enumeration(name, values) {
  return Object.freeze({
    ...Object.fromEntries(values.map((v) => [v, v])),
    values,
    parse(value) {
      const v = String(value ?? '').toUpperCase()
      if (!values.includes(v)) throw new ValidationError(`${name} debe ser uno de: ${values.join(', ')}`)
      return v
    },
  })
}

export const ReportType = enumeration('type', ['LOST', 'FOUND'])

export const ReportStatus = enumeration('status', ['ACTIVE', 'CLOSED', 'EXPIRED'])

export const CloseReason = Object.freeze({
  ...enumeration('reason', ['RECOVERED', 'RECOVERED_OTHER_MEANS', 'CANCELLED', 'INACTIVITY']),
  /** Motivos que el dueño puede elegir al cerrar su propio reporte (HU-06). */
  byOwner: ['RECOVERED_OTHER_MEANS', 'CANCELLED'],
  /** Motivos que cuentan como objeto recuperado en las métricas (HU-18, HU-19). */
  recovered: ['RECOVERED', 'RECOVERED_OTHER_MEANS'],
})

/** Dónde se perdió o encontró el objeto: coordenadas opcionales y/o descripción del lugar. */
export class Location {
  constructor({ latitude = null, longitude = null, textDirection = null }) {
    if ((latitude === null) !== (longitude === null)) {
      throw new ValidationError('location:latitude y longitude deben ir juntas')
    }
    this.latitude = latitude
    this.longitude = longitude
    this.textDirection = textDirection
    Object.freeze(this)
  }

  /** Devuelve null si no viene ningún dato de ubicación. */
  static from(data) {
    if (!data) return null
    const { latitude = null, longitude = null, textDirection = null } = data
    if (latitude === null && longitude === null && !textDirection) return null
    return new Location({ latitude, longitude, textDirection })
  }
}

/**
 * Detalle que solo conoce el dueño (HU-03). Nunca se expone; solo se compara (HU-12)
 * sin importar mayúsculas, tildes ni espacios.
 */
export class PrivateFeature {
  constructor(value) {
    if (!PrivateFeature.normalize(value)) throw new ValidationError('privateFeature:no puede estar vacía')
    this.value = String(value).trim()
    Object.freeze(this)
  }

  static from(value) {
    return PrivateFeature.normalize(value) ? new PrivateFeature(value) : null
  }

  static normalize(text) {
    return String(text ?? '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim()
  }

  matches(candidate) {
    return PrivateFeature.normalize(candidate) === PrivateFeature.normalize(this.value)
  }
}

/** Regla de expiración (HU-16 / HU-25): días sin actividad antes de expirar. */
export class ExpirationPolicy {
  static DAY_MS = 86_400_000

  constructor(days) {
    if (!Number.isInteger(days) || days <= 0) throw new ValidationError('Los días de expiración deben ser positivos')
    this.days = days
    Object.freeze(this)
  }

  expiresAt(lastActivityDate) {
    return new Date(new Date(lastActivityDate).getTime() + this.days * ExpirationPolicy.DAY_MS)
  }

  /** Fecha límite: lo que no tenga actividad desde antes de esta fecha ya debe expirar. */
  inactiveSince(now = new Date()) {
    return new Date(now.getTime() - this.days * ExpirationPolicy.DAY_MS)
  }
}
