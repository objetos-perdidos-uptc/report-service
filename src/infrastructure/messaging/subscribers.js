// Suscriptores de los eventos de dominio dentro del proceso.
import { ReportEvents } from '../../domain/events.js'
import { matchingClient } from '../discovery/matching.client.js'

/** Deja traza de cada evento publicado. */
export function logEvent(event) {
  console.log(`[evento] ${event.type} reportId=${event.aggregateId} id=${event.eventId}`)
}

/**
 * Puente temporal hacia matching-service por HTTP mientras no exista el event bus.
 * Con RabbitMQ/Kafka, matching-service consumirá estos mismos eventos directamente.
 */
export function registerMatchingBridge(publisher) {
  const evaluate = (event) => matchingClient.evaluate(event.aggregateId)
  const cleanup = (event) => matchingClient.cleanup(event.aggregateId)

  publisher
    .subscribe(ReportEvents.CREATED, evaluate)
    .subscribe(ReportEvents.UPDATED, evaluate)
    .subscribe(ReportEvents.RENEWED, evaluate)
    .subscribe(ReportEvents.CLOSED, cleanup)
    .subscribe(ReportEvents.EXPIRED, cleanup)
}
