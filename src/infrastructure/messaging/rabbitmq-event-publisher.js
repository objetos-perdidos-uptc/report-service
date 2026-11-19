// Adaptador de salida EDA: implementa el puerto EventPublisher publicando en RabbitMQ.
//
// Publica en el exchange tipo "topic" `reports.events` con la routing key igual al tipo del evento
// (report.created, report.closed...). Cada servicio interesado crea su propia cola y la enlaza con
// el patrón que le sirva, p. ej. matching-service: `report.*`.
//
// Si el broker no está disponible, los eventos se guardan en memoria y se envían al reconectar,
// para que una caída momentánea de RabbitMQ no haga fallar la operación del usuario.
import { EventPublisher } from '../../domain/ports.js'

const MAX_PENDING = 1000

export class RabbitMqEventPublisher extends EventPublisher {
  #connection
  #exchange
  #channel = null
  #pending = []
  #flushing = false
  #onPublished

  /** @param onPublished callback opcional (p. ej. métricas) que recibe cada evento enviado */
  constructor(connection, exchange, onPublished = () => {}) {
    super()
    this.#connection = connection
    this.#exchange = exchange
    this.#onPublished = onPublished
    connection.onReady(async (conn) => {
      const channel = await conn.createConfirmChannel()
      channel.on('close', () => { this.#channel = null })
      await channel.assertExchange(exchange, 'topic', { durable: true })
      this.#channel = channel
      await this.#flush()
    })
  }

  get pendingCount() {
    return this.#pending.length
  }

  async publish(events) {
    for (const event of events) {
      if (this.#pending.length >= MAX_PENDING) {
        console.error(`RabbitMQ: cola local llena, se descarta ${event.type} ${event.eventId}`)
        continue
      }
      this.#pending.push(event)
    }
    await this.#flush()
  }

  async #flush() {
    if (this.#flushing) return   // otra llamada ya está vaciando la cola (y verá los nuevos eventos)
    this.#flushing = true
    try {
      await this.#sendPending()
    } finally {
      this.#flushing = false
    }
  }

  async #sendPending() {
    while (this.#channel && this.#pending.length > 0) {
      const event = this.#pending[0]
      try {
        this.#channel.publish(this.#exchange, event.type, Buffer.from(JSON.stringify(event)), {
          persistent: true,                  // sobrevive a un reinicio del broker
          contentType: 'application/json',
          messageId: event.eventId,
          type: event.type,
          timestamp: Math.floor(Date.parse(event.occurredAt) / 1000),
          appId: 'report-service',
        })
        await this.#channel.waitForConfirms()   // el broker confirmó que lo recibió
        this.#pending.shift()
        this.#onPublished(event)
      } catch (e) {
        console.warn(`RabbitMQ: no se pudo publicar ${event.type}, se reintentará: ${e.message}`)
        return
      }
    }
    if (this.#pending.length > 0 && !this.#connection.isConnected) {
      console.warn(`RabbitMQ sin conexión: ${this.#pending.length} evento(s) en espera`)
    }
  }
}
