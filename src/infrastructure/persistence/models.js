// Modelos del ORM (Sequelize): cómo se guardan los datos en PostgreSQL.
// No son el dominio: el repositorio los traduce al agregado Report y viceversa.
import { DataTypes } from 'sequelize'
import { ReportStatus, ReportType } from '../../domain/value-objects.js'
import { sequelize } from './db.js'

export const CategoryModel = sequelize.define('Category', {
  categoryId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(80), allowNull: false, unique: true },
}, { tableName: 'categories', underscored: true, timestamps: false })

export const ReportModel = sequelize.define('Report', {
  reportId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  type: { type: DataTypes.ENUM(...ReportType.values), allowNull: false },
  status: { type: DataTypes.ENUM(...ReportStatus.values), allowNull: false, defaultValue: 'ACTIVE' },

  name: { type: DataTypes.STRING(120), allowNull: false },
  description: DataTypes.TEXT,
  color: DataTypes.STRING(60),
  material: DataTypes.STRING(60),
  categoryId: { type: DataTypes.INTEGER, allowNull: false },
  campusId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.BIGINT, allowNull: false },

  // Ubicación
  latitude: DataTypes.DOUBLE,
  longitude: DataTypes.DOUBLE,
  textDirection: DataTypes.STRING(255),

  privateFeature: DataTypes.STRING(255),

  // Solo LOST
  dateLost: DataTypes.DATE,
  reward: DataTypes.DOUBLE,

  // Solo FOUND
  dateOfDiscovery: DataTypes.DATE,
  custodyLocation: DataTypes.STRING(255),

  // Ciclo de vida
  lastActivityDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  closedAt: DataTypes.DATE,
  closeReason: DataTypes.STRING(40),
  reminderSentAt: DataTypes.DATE,   // HU-25: cuándo se avisó que el reporte está por expirar
}, {
  tableName: 'reports',
  underscored: true,
  createdAt: 'creationDate',
  updatedAt: 'updatedAt',
  indexes: [
    { fields: ['campus_id', 'status', 'type'] },
    { fields: ['user_id'] },
  ],
})

export const PhotoModel = sequelize.define('Photo', {
  photoId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  filename: { type: DataTypes.STRING(120), allowNull: false },
  url: { type: DataTypes.STRING(255), allowNull: false },
}, { tableName: 'report_photos', underscored: true, updatedAt: false })

ReportModel.hasMany(PhotoModel, { as: 'photos', foreignKey: 'reportId', onDelete: 'CASCADE' })
PhotoModel.belongsTo(ReportModel, { foreignKey: 'reportId' })
ReportModel.belongsTo(CategoryModel, { as: 'category', foreignKey: 'categoryId' })

const DEFAULT_CATEGORIES = [
  'Electrónicos', 'Documentos', 'Llaves', 'Ropa y accesorios',
  'Mochilas y bolsos', 'Libros y útiles', 'Billeteras y dinero', 'Otros',
]

/** Carga las categorías base la primera vez. */
export async function seedCategories() {
  if (await CategoryModel.count() > 0) return
  await CategoryModel.bulkCreate(DEFAULT_CATEGORIES.map((name) => ({ name })))
}

/**
 * Migraciones simples: sync() crea tablas nuevas pero no agrega columnas a tablas que ya existen.
 * Aquí se agregan las columnas que se sumaron después de la primera versión, sin perder datos.
 */
export async function migrateSchema() {
  const qi = sequelize.getQueryInterface()
  const columns = await qi.describeTable('reports')
  if (!columns.reminder_sent_at) {
    await qi.addColumn('reports', 'reminder_sent_at', { type: DataTypes.DATE })
    console.log('PostgreSQL: columna reports.reminder_sent_at agregada')
  }
}
