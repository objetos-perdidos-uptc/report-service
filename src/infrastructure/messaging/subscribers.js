// Suscriptores de los eventos de dominio dentro del proceso.

/** Deja traza de cada evento publicado. */
export function logEvent(event) {
  console.log(`[evento] ${event.type} reportId=${event.aggregateId} id=${event.eventId}`)
}

/** Reenvía cada evento al event bus externo (RabbitMQ) para los demás microservicios. */
export function forwardTo(externalPublisher) {
  return (event) => externalPublisher.publish([event])
}
