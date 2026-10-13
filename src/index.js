import { app } from './app.js'
import { config } from './config.js'
import { initDb, sequelize } from './db.js'
import * as eureka from './eureka.js'
import { startExpirationJob } from './jobs/expiration.job.js'
import { seedCategories } from './models/index.js'

// 1. PostgreSQL: conexión, tablas y categorías base
await initDb()
await seedCategories()

// 2. HTTP
const server = app.listen(config.port, () => {
  console.log(`${config.appName} escuchando en el puerto ${config.port} (Swagger: /docs)`)
})

// 3. Cron de expiración
startExpirationJob()

// 4. Eureka: registrar y arrancar heartbeat
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
