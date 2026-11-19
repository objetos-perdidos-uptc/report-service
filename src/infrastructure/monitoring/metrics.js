// Monitoreo con Prometheus: GET /metrics expone métricas que Prometheus lee cada pocos segundos
// y Grafana grafica.
import client from 'prom-client'
import { EventPublisher } from '../../domain/ports.js'
import { ReportStatus } from '../../domain/value-objects.js'

export const registry = new client.Registry()
registry.setDefaultLabels({ service: 'report-service' })
client.collectDefaultMetrics({ register: registry })   // CPU, memoria, event loop de Node.js

const httpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'Peticiones HTTP atendidas',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
})

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duración de las peticiones HTTP',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
})

const domainEvents = new client.Counter({
  name: 'report_domain_events_total',
  help: 'Eventos de dominio emitidos (transacciones del negocio: reportes creados, cerrados...)',
  labelNames: ['type'],
  registers: [registry],
})

/** Middleware Express: mide cada petición. Usa la ruta con parámetros (/reports/:id) para no crear miles de series. */
export function httpMetrics(req, res, next) {
  const end = httpDuration.startTimer()
  res.on('finish', () => {
    const route = req.route ? req.baseUrl + req.route.path : 'sin_ruta'
    const labels = { method: req.method, route, status: res.statusCode }
    httpRequests.inc(labels)
    end(labels)
  })
  next()
}

/** Decorador del puerto EventPublisher: cuenta cada evento y delega en el publicador real. */
export class InstrumentedEventPublisher extends EventPublisher {
  constructor(inner) {
    super()
    this.inner = inner
  }

  async publish(events) {
    for (const event of events) domainEvents.inc({ type: event.type })
    await this.inner.publish(events)
  }
}

/** Métricas que se calculan al momento de cada lectura de Prometheus. */
export function registerStateMetrics({ reports, rabbitmq, publisher }) {
  for (const name of ['reports_by_status', 'rabbitmq_connected', 'report_events_pending']) {
    registry.removeSingleMetric(name)
  }

  new client.Gauge({
    name: 'reports_by_status',
    help: 'Reportes guardados por estado',
    labelNames: ['status'],
    registers: [registry],
    async collect() {
      const counts = await reports.countByStatus()
      for (const status of ReportStatus.values) this.set({ status }, counts[status] ?? 0)
    },
  })

  new client.Gauge({
    name: 'rabbitmq_connected',
    help: '1 si hay conexión con RabbitMQ, 0 si no (o si no está configurado)',
    registers: [registry],
    collect() { this.set(rabbitmq?.isConnected ? 1 : 0) },
  })

  new client.Gauge({
    name: 'report_events_pending',
    help: 'Eventos esperando a que RabbitMQ vuelva a estar disponible',
    registers: [registry],
    collect() { this.set(publisher?.pendingCount ?? 0) },
  })
}

export async function metricsHandler(req, res) {
  res.set('Content-Type', registry.contentType)
  res.end(await registry.metrics())
}
