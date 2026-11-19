import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { config } from '../config.js'
import { internalController } from './controllers/internal.controller.js'
import { reportController } from './controllers/report.controller.js'
import { httpMetrics, metricsHandler } from '../monitoring/metrics.js'
import { openapi } from './docs/openapi.js'
import { errorHandler, notFound } from './middlewares/error.js'
import { internalRouter } from './routes/internal.routes.js'
import { reportRouter } from './routes/report.routes.js'

export function createApp(container) {
  const app = express()
  app.use(httpMetrics)
  app.use(express.json())

  app.get('/', (req, res) => res.json({ service: config.appName, docs: '/docs' }))
  app.get('/health', (req, res) => res.json({
    status: 'UP',
    service: config.appName,
    port: config.port,
    rabbitmq: container.rabbitmq ? (container.rabbitmq.isConnected ? 'UP' : 'DOWN') : 'DISABLED',
  }))

  // Prometheus (no pasa por el Gateway: Prometheus lo lee directo dentro de la red de Docker)
  app.get('/metrics', metricsHandler)

  // Swagger
  app.get('/openapi.json', (req, res) => res.json(openapi))
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi))

  app.use('/reports', reportRouter(reportController(container)))
  app.use('/internal', internalRouter(internalController(container)))

  app.use(notFound)
  app.use(errorHandler)
  return app
}
