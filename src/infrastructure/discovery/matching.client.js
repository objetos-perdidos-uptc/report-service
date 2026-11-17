// Llamadas a matching-service, resuelto por su nombre en Eureka.
// Son "best effort": si matching no está arriba, el reporte igual se guarda.
import { config } from '../config.js'
import { resolve } from './eureka.js'

async function call(method, path) {
  try {
    const baseUrl = await resolve(config.matchingService)
    if (!baseUrl) {
      console.warn(`matching-service no está registrado en Eureka; se omite ${method} ${path}`)
      return
    }
    const res = await fetch(`${baseUrl}${path}`, { method, signal: AbortSignal.timeout(5000) })
    if (!res.ok) console.warn(`matching-service respondió ${res.status} a ${method} ${path}`)
  } catch (e) {
    console.warn(`matching-service no disponible (${method} ${path}): ${e.message}`)
  }
}

export const matchingClient = {
  /** Pide recalcular las coincidencias de un reporte nuevo o editado. */
  evaluate: (reportId) => call('POST', `/matching/evaluate/${reportId}`),
  /** Limpia las coincidencias de un reporte cerrado o expirado. */
  cleanup: (reportId) => call('DELETE', `/matching/report/${reportId}`),
}
