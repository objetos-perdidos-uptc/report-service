import { buildContainer } from './container.js'
import { config } from './infrastructure/config.js'
import * as eureka from './infrastructure/discovery/eureka.js'
import { createApp } from './infrastructure/http/app.js'
import { startClaimEventsConsumer } from './infrastructure/messaging/claim-events.consumer.js'
import { initDb, sequelize } from './infrastructure/persistence/db.js'
import { seedCategories } from './infrastructure/persistence/models.js'
import { startExpirationJob } from './infrastructure/scheduling/expiration.job.js'

// 1. PostgreSQL: conexión, tablas y categorías base
await initDb()
await seedCategories()

// 2. Conectar puertos con adaptadores
const container = buildContainer()

// 3. Event bus (EDA): publicar eventos propios y escuchar los de claim-service
if (container.rabbitmq) {
  startClaimEventsConsumer(container.rabbitmq, {
    exchange: config.rabbitmq.claimsExchange,
    queue: config.rabbitmq.claimsQueue,
  }, container.commands.changeReportStatus)
  container.rabbitmq.start()
} else {
  console.log('RABBITMQ_URL no configurado: los eventos solo se registran en el log')
}

// 4. HTTP
const server = createApp(container).listen(config.port, () => {
  console.log(`${config.appName} escuchando en el puerto ${config.port} (Swagger: /docs, métricas: /metrics)`)
})

// 5. Cron de expiración
startExpirationJob(container.commands.expireInactiveReports, config.expirationCron)

// 6. Eureka: registrar y arrancar heartbeat
eureka.register().then(eureka.startHeartbeat)

// shutdown limpio
async function shutdown() {
  await eureka.deregister()
  server.close()
  await container.rabbitmq?.close()
  await sequelize.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
