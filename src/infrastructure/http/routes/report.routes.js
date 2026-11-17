// Rutas públicas: el API Gateway enruta /reports/** hacia este servicio.
import { Router } from 'express'
import { gatewayUser } from '../middlewares/auth.js'
import { wrap } from '../middlewares/error.js'
import { uploadPhotos } from '../middlewares/upload.js'

export function reportRouter(c) {
  const router = Router()
  router.use(gatewayUser)

  // Las rutas fijas van antes de /:id
  router.get('/categories', wrap(c.categories))
  router.get('/feed', wrap(c.feed))
  router.get('/search', wrap(c.search))
  router.get('/me', wrap(c.history))
  router.get('/photos/:filename', c.photo)

  router.post('/', wrap(c.create))
  router.get('/:id', wrap(c.detail))
  router.put('/:id', wrap(c.update))
  router.patch('/:id/close', wrap(c.close))
  router.patch('/:id/renew', wrap(c.renew))
  router.post('/:id/photos', uploadPhotos, wrap(c.addPhotos))
  router.delete('/:id/photos/:photoId', wrap(c.deletePhoto))
  return router
}
