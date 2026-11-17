// Adaptador de entrada HTTP: convierte peticiones en comandos/consultas y respuestas en DTOs.
import {
  fromCreateRequest, fromUpdateRequest, toPageDTO, toPublicDTO,
} from '../../../application/dto/report.dto.js'
import { HttpError } from '../middlewares/error.js'
import { UPLOAD_PATH } from '../middlewares/upload.js'

export function reportController({ commands, queries, policy }) {
  const dto = (req) => (report) => toPublicDTO(report, req.user.id, policy)
  const page = async (req, res, result) =>
    res.json(toPageDTO(result, result.page, result.size, dto(req)))

  return {
    categories: async (req, res) => res.json(await queries.categories()),

    create: async (req, res) => {
      const report = await commands.createReport.execute(fromCreateRequest(req.body, req.user))
      res.status(201).json(dto(req)(report))
    },

    feed: async (req, res) => page(req, res, await queries.feed(req.query, req.user)),

    search: async (req, res) => page(req, res, await queries.search(req.query, req.user)),

    history: async (req, res) => res.json((await queries.history(req.query, req.user)).map(dto(req))),

    detail: async (req, res) => res.json(dto(req)(await queries.detail(req.params.id))),

    update: async (req, res) => {
      const report = await commands.updateReport.execute({
        reportId: req.params.id, userId: req.user.id, changes: fromUpdateRequest(req.body),
      })
      res.json(dto(req)(report))
    },

    close: async (req, res) => {
      const report = await commands.closeReport.execute({
        reportId: req.params.id, userId: req.user.id, reason: req.body?.reason,
      })
      res.json(dto(req)(report))
    },

    renew: async (req, res) => {
      res.json(dto(req)(await commands.renewReport.execute({ reportId: req.params.id, userId: req.user.id })))
    },

    addPhotos: async (req, res) => {
      const report = await commands.addReportPhotos.execute({
        reportId: req.params.id, userId: req.user.id, filenames: (req.files ?? []).map((f) => f.filename),
      })
      res.status(201).json(dto(req)(report))
    },

    deletePhoto: async (req, res) => {
      await commands.removeReportPhoto.execute({
        reportId: req.params.id, userId: req.user.id, photoId: req.params.photoId,
      })
      res.status(204).end()
    },

    photo: (req, res, next) => {
      res.sendFile(req.params.filename.replace(/[\\/]/g, ''), { root: UPLOAD_PATH, maxAge: '1d' }, (err) => {
        if (err) next(new HttpError(404, 'Foto no encontrada'))
      })
    },
  }
}
