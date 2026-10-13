// Rutas internas: el API Gateway NO las expone. Las consumen los otros microservicios
// directamente, resolviendo REPORT-SERVICE en Eureka.
import { Router } from 'express'
import { internalController as c } from '../controllers/internal.controller.js'
import { wrap } from '../middlewares/error.js'

export const internalRouter = Router()

internalRouter.get('/reports', wrap(c.list))
internalRouter.get('/reports/expiring', wrap(c.expiring))
internalRouter.get('/reports/stats', wrap(c.stats))
internalRouter.get('/reports/:id', wrap(c.detail))
internalRouter.post('/reports/:id/verify-private-feature', wrap(c.verifyPrivateFeature))
internalRouter.patch('/reports/:id/status', wrap(c.setStatus))
