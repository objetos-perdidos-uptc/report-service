// Rutas internas: el API Gateway NO las expone. Las consumen los otros microservicios
// directamente, resolviendo REPORT-SERVICE en Eureka.
import { Router } from 'express'
import { wrap } from '../middlewares/error.js'

export function internalRouter(c) {
  const router = Router()
  router.get('/reports', wrap(c.list))
  router.get('/reports/expiring', wrap(c.expiring))
  router.get('/reports/stats', wrap(c.stats))
  router.get('/reports/:id', wrap(c.detail))
  router.post('/reports/:id/verify-private-feature', wrap(c.verifyPrivateFeature))
  router.patch('/reports/:id/status', wrap(c.setStatus))
  return router
}
