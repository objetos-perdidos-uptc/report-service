import path from 'node:path'
import { HttpError } from '../middlewares/error.js'
import { UPLOAD_PATH } from '../middlewares/upload.js'
import { reportService as service } from '../services/report.service.js'

export const reportController = {
  categories: async (req, res) => res.json(await service.categories()),

  create: async (req, res) => res.status(201).json(await service.create(req.body, req.user)),

  feed: async (req, res) => res.json(await service.feed(req.query, req.user)),

  search: async (req, res) => res.json(await service.search(req.query, req.user)),

  history: async (req, res) => res.json(await service.history(req.query, req.user)),

  detail: async (req, res) => res.json(await service.detail(req.params.id, req.user)),

  update: async (req, res) => res.json(await service.update(req.params.id, req.body, req.user)),

  close: async (req, res) => res.json(await service.close(req.params.id, req.body, req.user)),

  renew: async (req, res) => res.json(await service.renew(req.params.id, req.user)),

  addPhotos: async (req, res) =>
    res.status(201).json(await service.addPhotos(req.params.id, req.files, req.user)),

  deletePhoto: async (req, res) => {
    await service.deletePhoto(req.params.id, req.params.photoId, req.user)
    res.status(204).end()
  },

  photo: (req, res, next) => {
    res.sendFile(path.basename(req.params.filename), { root: UPLOAD_PATH, maxAge: '1d' }, (err) => {
      if (err) next(new HttpError(404, 'Foto no encontrada'))
    })
  },
}
