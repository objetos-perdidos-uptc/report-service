// Adaptador de persistencia: implementa el puerto ReportRepository con Sequelize + PostgreSQL.
// Traduce entre filas del ORM y el agregado Report del dominio.
import { Op } from 'sequelize'
import { Photo } from '../../domain/photo.js'
import { ReportRepository } from '../../domain/ports.js'
import { Report } from '../../domain/report.js'
import { Location, PrivateFeature } from '../../domain/value-objects.js'
import { sequelize } from './db.js'
import { CategoryModel, PhotoModel, ReportModel } from './models.js'

const INCLUDE = [
  { model: PhotoModel, as: 'photos' },
  { model: CategoryModel, as: 'category' },
]
const ORDER = [['creationDate', 'DESC'], [{ model: PhotoModel, as: 'photos' }, 'photoId', 'ASC']]

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

// ---------- Mapeo fila <-> agregado ----------

function toDomain(row) {
  return new Report({
    ...row.get({ plain: true }),
    location: Location.from(row),
    privateFeature: PrivateFeature.from(row.privateFeature),
    categoryName: row.category?.name ?? null,
    photos: (row.photos ?? []).map((p) => new Photo(p.get({ plain: true }))),
  })
}

function toRow(report) {
  return {
    type: report.type,
    status: report.status,
    name: report.name,
    description: report.description,
    color: report.color,
    material: report.material,
    categoryId: report.categoryId,
    campusId: report.campusId,
    userId: report.userId,
    latitude: report.location?.latitude ?? null,
    longitude: report.location?.longitude ?? null,
    textDirection: report.location?.textDirection ?? null,
    privateFeature: report.privateFeature?.value ?? null,
    dateLost: report.dateLost,
    reward: report.reward,
    dateOfDiscovery: report.dateOfDiscovery,
    custodyLocation: report.custodyLocation,
    lastActivityDate: report.lastActivityDate,
    closedAt: report.closedAt,
    closeReason: report.closeReason,
  }
}

export class SequelizeReportRepository extends ReportRepository {
  async findById(reportId) {
    const row = await ReportModel.findByPk(reportId, { include: INCLUDE, order: ORDER })
    return row ? toDomain(row) : null
  }

  async save(report) {
    await sequelize.transaction(async (transaction) => {
      if (report.reportId == null) {
        const row = await ReportModel.create(toRow(report), { transaction })
        report.reportId = row.reportId
        report.creationDate = row.creationDate
      } else {
        await ReportModel.update(toRow(report), { where: { reportId: report.reportId }, transaction })
      }

      // Sincronizar fotos: borrar las que ya no están en el agregado e insertar las nuevas
      const kept = report.photos.filter((p) => p.photoId != null).map((p) => p.photoId)
      await PhotoModel.destroy({
        where: { reportId: report.reportId, ...(kept.length ? { photoId: { [Op.notIn]: kept } } : {}) },
        transaction,
      })
      for (const photo of report.photos.filter((p) => p.photoId == null)) {
        const row = await PhotoModel.create(
          { reportId: report.reportId, filename: photo.filename, url: photo.url }, { transaction })
        photo.photoId = row.photoId
        photo.createdAt = row.createdAt
      }
    })
  }

  async findPage(filters, page, size) {
    const { rows, count } = await ReportModel.findAndCountAll({
      where: buildWhere(filters),
      include: INCLUDE,
      order: ORDER,
      limit: size,
      offset: page * size,
      distinct: true,   // que el count no se multiplique por las fotos
    })
    return { items: rows.map(toDomain), total: count }
  }

  async findAll(filters) {
    const rows = await ReportModel.findAll({ where: buildWhere(filters), include: INCLUDE, order: ORDER })
    return rows.map(toDomain)
  }

  async findActiveByLastActivity({ before, after }) {
    const rows = await ReportModel.findAll({
      where: {
        status: 'ACTIVE',
        lastActivityDate: { [Op.lt]: before, ...(after ? { [Op.gte]: after } : {}) },
      },
      include: INCLUDE,
      order: [['lastActivityDate', 'ASC']],
    })
    return rows.map(toDomain)
  }

  async countByStatus() {
    const rows = await ReportModel.count({ group: ['status'] })
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]))
  }

  findCategories() {
    return CategoryModel.findAll({ order: [['categoryId', 'ASC']], raw: true })
  }

  async categoryExists(categoryId) {
    return (await CategoryModel.count({ where: { categoryId } })) > 0
  }
}
