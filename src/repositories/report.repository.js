// Acceso a datos con el ORM (Sequelize). Aquí no hay reglas de negocio.
import { Op } from 'sequelize'
import { Category, Photo, Report } from '../models/index.js'

const INCLUDE = [
  { model: Photo, as: 'photos' },
  { model: Category, as: 'category' },
]
const ORDER = [['creationDate', 'DESC'], [{ model: Photo, as: 'photos' }, 'photoId', 'ASC']]

/** Filtros opcionales -> cláusula WHERE. `q` busca por palabra clave (HU-22). */
function buildWhere({ campusId, type, status, categoryId, userId, q }) {
  const where = {}
  if (campusId != null) where.campusId = campusId
  if (type) where.type = type
  if (status) where.status = status
  if (categoryId != null) where.categoryId = categoryId
  if (userId != null) where.userId = userId
  if (q) {
    const like = { [Op.iLike]: `%${q.replace(/[\\%_]/g, '\\$&')}%` }
    where[Op.or] = ['name', 'description', 'color', 'material', 'textDirection', 'custodyLocation']
      .map((field) => ({ [field]: like }))
  }
  return where
}

export const reportRepository = {
  create: (data) => Report.create(data),

  findById: (reportId) => Report.findByPk(reportId, { include: INCLUDE, order: ORDER }),

  findAll: (filters, limit) =>
    Report.findAll({ where: buildWhere(filters), include: INCLUDE, order: ORDER, limit }),

  findPage: (filters, page, size) =>
    Report.findAndCountAll({
      where: buildWhere(filters),
      include: INCLUDE,
      order: ORDER,
      limit: size,
      offset: page * size,
      distinct: true,   // que el count no se multiplique por las fotos
    }),

  /** Reportes ACTIVE cuya última actividad es anterior a `before` (y posterior a `after`, si se pasa). */
  findActiveByLastActivity: ({ before, after }) =>
    Report.findAll({
      where: {
        status: 'ACTIVE',
        lastActivityDate: { [Op.lt]: before, ...(after ? { [Op.gte]: after } : {}) },
      },
      include: INCLUDE,
      order: [['lastActivityDate', 'ASC']],
    }),

  findForStats: () =>
    Report.findAll({ attributes: ['campusId', 'type', 'status', 'closeReason', 'creationDate', 'closedAt'], raw: true }),

  countPhotos: (reportId) => Photo.count({ where: { reportId } }),
  addPhotos: (photos) => Photo.bulkCreate(photos),
  findPhoto: (reportId, photoId) => Photo.findOne({ where: { reportId, photoId } }),

  findCategories: () => Category.findAll({ order: [['categoryId', 'ASC']] }),
  categoryExists: async (categoryId) => (await Category.count({ where: { categoryId } })) > 0,
}
