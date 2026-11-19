// Adaptador de ENTRADA EDA: escucha los eventos de claim-service y actualiza el reporte.
//
// Cuando un reclamo se aprueba o se confirma la entrega, el objeto volvió a su dueño: el reporte
// se cierra como RECOVERED y sale del feed, sin que claim-service tenga que llamar por HTTP.
//
// Contrato esperado (exchange topic `claims.events`):
//   routing key: claim.approved | claim.delivered
//   body JSON:   { "claimId": "...", "reportId": 12, "occurredAt": "..." }
import { BusinessRuleError, NotFoundError, ValidationError } from '../../domain/errors.js'
import { CloseReason, ReportStatus } from '../../domain/value-objects.js'

export const CLAIM_ROUTING_KEYS = ['claim.approved', 'claim.delivered']

/**
 * Lógica del consumidor separada de RabbitMQ para poder probarla.
 * @returns {'processed'|'ignored'} ignored = evento inválido o ya aplicado (no se reintenta)
 */
export async function handleClaimEvent(event, changeReportStatus) {
  const reportId = Number(event?.reportId)
  if (!Number.isInteger(reportId) || reportId <= 0) {
    console.warn(`Evento de reclamo sin reportId válido: ${JSON.stringify(event)}`)
    return 'ignored'
  }
  try {
    await changeReportStatus.execute({ reportId, status: ReportStatus.CLOSED, reason: CloseReason.RECOVERED })
    console.log(`Reporte ${reportId} cerrado por el reclamo ${event.claimId ?? '?'}`)
    return 'processed'
  } catch (e) {
    // Ya estaba cerrado, no existe o el dato es inválido: reintentar no lo arregla (idempotencia)
    if (e instanceof BusinessRuleError || e instanceof NotFoundError || e instanceof ValidationError) {
      console.warn(`Evento de reclamo para el reporte ${reportId} ignorado: ${e.message}`)
      return 'ignored'
    }
    throw e
  }
}

export function startClaimEventsConsumer(connection, { exchange, queue }, changeReportStatus) {
  connection.onReady(async (conn) => {
    const channel = await conn.createChannel()
    await channel.assertExchange(exchange, 'topic', { durable: true })
    await channel.assertQueue(queue, { durable: true })
    for (const key of CLAIM_ROUTING_KEYS) await channel.bindQueue(queue, exchange, key)
    await channel.prefetch(10)

    await channel.consume(queue, async (msg) => {
      if (!msg) return
      let event
      try {
        event = JSON.parse(msg.content.toString())
      } catch {
        console.warn('Evento de reclamo con JSON inválido, se descarta')
        return channel.ack(msg)
      }
      try {
        await handleClaimEvent(event, changeReportStatus)
        channel.ack(msg)
      } catch (e) {
        // Error transitorio (p. ej. la base de datos): se reintenta una vez y luego se descarta
        console.error(`Error procesando evento de reclamo: ${e.message}`)
        channel.nack(msg, false, !msg.fields.redelivered)
      }
    })
    console.log(`Escuchando ${CLAIM_ROUTING_KEYS.join(', ')} en ${exchange} -> cola ${queue}`)
  })
}
