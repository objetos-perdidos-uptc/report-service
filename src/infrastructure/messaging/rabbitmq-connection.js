// Conexión compartida con RabbitMQ: reconecta sola si el broker se cae o aún no arrancó.
import amqp from 'amqplib'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class RabbitMqConnection {
  #url
  #connection = null
  #closing = false
  #onReadyHandlers = []

  constructor(url) {
    this.#url = url
  }

  get isConnected() {
    return this.#connection !== null
  }

  /** Registra algo que debe (re)configurarse cada vez que hay conexión: exchanges, colas, consumidores. */
  onReady(handler) {
    this.#onReadyHandlers.push(handler)
    if (this.#connection) handler(this.#connection).catch((e) => console.error(`RabbitMQ: ${e.message}`))
  }

  /** Intenta conectar en segundo plano hasta lograrlo. */
  async start() {
    for (let intento = 1; !this.#closing; intento++) {
      try {
        const connection = await amqp.connect(this.#url)
        connection.on('error', (e) => console.warn(`RabbitMQ: error de conexión: ${e.message}`))
        connection.on('close', () => {
          this.#connection = null
          if (!this.#closing) {
            console.warn('RabbitMQ: conexión perdida, reconectando…')
            this.start()
          }
        })
        this.#connection = connection
        console.log('RabbitMQ conectado')
        for (const handler of this.#onReadyHandlers) await handler(connection)
        return
      } catch (e) {
        this.#connection = null
        console.warn(`RabbitMQ no disponible (intento ${intento}): ${e.message}`)
        await sleep(5000)
      }
    }
  }

  async close() {
    this.#closing = true
    await this.#connection?.close().catch(() => {})
  }
}
