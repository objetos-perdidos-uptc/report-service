// Rutas públicas: el API Gateway enruta /reports/** hacia este servicio.
import { Router } from 'express'
import { reportController as c } from '../controllers/report.controller.js'
import { gatewayUser } from '../middlewares/auth.js'
import { wrap } from '../middlewares/error.js'
import { uploadPhotos } from '../middlewares/upload.js'

export const reportRouter = Router()

reportRouter.use(gatewayUser)

// Las rutas fijas van antes de /:id
reportRouter.get('/categories', wrap(c.categories))
reportRouter.get('/feed', wrap(c.feed))
reportRouter.get('/search', wrap(c.search))
reportRouter.get('/me', wrap(c.history))
reportRouter.get('/photos/:filename', c.photo)

reportRouter.post('/', wrap(c.create))
reportRouter.get('/:id', wrap(c.detail))
reportRouter.put('/:id', wrap(c.update))
reportRouter.patch('/:id/close', wrap(c.close))
reportRouter.patch('/:id/renew', wrap(c.renew))
reportRouter.post('/:id/photos', uploadPhotos, wrap(c.addPhotos))
reportRouter.delete('/:id/photos/:photoId', wrap(c.deletePhoto))
