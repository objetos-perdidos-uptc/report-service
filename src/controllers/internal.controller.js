import { reportService as service } from '../services/report.service.js'

export const internalController = {
  list: async (req, res) => res.json(await service.internalList(req.query)),

  expiring: async (req, res) => res.json(await service.expiringSoon(req.query)),

  stats: async (req, res) => res.json(await service.stats()),

  detail: async (req, res) => res.json(await service.internalDetail(req.params.id)),

  verifyPrivateFeature: async (req, res) =>
    res.json(await service.verifyPrivateFeature(req.params.id, req.body)),

  setStatus: async (req, res) => res.json(await service.internalSetStatus(req.params.id, req.body)),
}
