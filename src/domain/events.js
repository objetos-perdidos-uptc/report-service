// Eventos de dominio: hechos que ya ocurrieron sobre un reporte (EDA).
// Llevan una copia del reporte (sin la característica privada) para que quien los consuma
// no tenga que volver a pedirle datos a este servicio.
import { randomUUID } from 'node:crypto'

export const ReportEvents = Object.freeze({
  CREATED: 'report.created',
  UPDATED: 'report.updated',
  RENEWED: 'report.renewed',
  CLOSED: 'report.closed',
  EXPIRED: 'report.expired',
  PHOTOS_CHANGED: 'report.photos-changed',
})

export function createDomainEvent(type, snapshot, data = {}, occurredAt = new Date()) {
  return Object.freeze({
    eventId: randomUUID(),
    type,
    occurredAt: occurredAt.toISOString(),
    aggregateId: snapshot.reportId,
    report: snapshot,
    data,
  })
}
