// Adaptador de eventos EN MEMORIA: implementa el puerto EventPublisher repartiendo cada evento
// a los suscriptores registrados dentro de este mismo proceso.
//
// Es el paso previo al event bus: cuando se agregue RabbitMQ/Kafka, se crea otro adaptador que
// extienda EventPublisher y se cambia en container.js. El dominio y los casos de uso no cambian.
import { EventPublisher } from '../../domain/ports.js'

export class InProcessEventPublisher extends EventPublisher {
  #handlers = new Map()   // tipo de evento ('*' = todos) -> [handler]

  subscribe(type, handler) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, [])
    this.#handlers.get(type).push(handler)
    return this
  }

  async publish(events) {
    for (const event of events) {
      const handlers = [...(this.#handlers.get(event.type) ?? []), ...(this.#handlers.get('*') ?? [])]
      // Un suscriptor que falla no debe tumbar el caso de uso que ya se guardó
      await Promise.allSettled(handlers.map(async (handler) => {
        try {
          await handler(event)
        } catch (e) {
          console.warn(`Suscriptor de ${event.type} falló: ${e.message}`)
        }
      }))
    }
  }
}
