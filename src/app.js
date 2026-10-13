import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { config } from './config.js'
import { openapi } from './docs/openapi.js'
import { errorHandler, notFound } from './middlewares/error.js'
import { internalRouter } from './routes/internal.routes.js'
import { reportRouter } from './routes/report.routes.js'

export const app = express()

app.use(express.json())

app.get('/', (req, res) => res.json({ service: config.appName, docs: '/docs' }))
app.get('/health', (req, res) => res.json({ status: 'UP', service: config.appName, port: config.port }))

// Swagger
app.get('/openapi.json', (req, res) => res.json(openapi))
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi))

app.use('/reports', reportRouter)
app.use('/internal', internalRouter)

app.use(notFound)
app.use(errorHandler)
