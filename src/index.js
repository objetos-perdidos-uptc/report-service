import { buildContainer } from './container.js'
import { config } from './infrastructure/config.js'
import * as eureka from './infrastructure/discovery/eureka.js'
import { createApp } from './infrastructure/http/app.js'
import { initDb, sequelize } from './infrastructure/persistence/db.js'
import { seedCategories } from './infrastructure/persistence/models.js'
import { startExpirationJob } from './infrastructure/scheduling/expiration.job.js'

// 1. PostgreSQL: conexión, tablas y categorías base
await initDb()
await seedCategories()

// 2. Conectar puertos con adaptadores
const container = buildContainer()

// 3. HTTP
const server = createApp(container).listen(config.port, () => {
  console.log(`${config.appName} escuchando en el puerto ${config.port} (Swagger: /docs)`)
})

// 4. Cron de expiración
startExpirationJob(container.commands.expireInactiveReports, config.expirationCron)

// 5. Eureka: registrar y arrancar heartbeat
eureka.register().then(eureka.startHeartbeat)

// shutdown limpio
async function shutdown() {
  await eureka.deregister()
  server.close()
  await sequelize.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
