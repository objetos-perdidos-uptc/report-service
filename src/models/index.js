import { DataTypes } from 'sequelize'
import { sequelize } from '../db.js'

export const REPORT_TYPES = ['LOST', 'FOUND']
export const REPORT_STATUS = ['ACTIVE', 'CLOSED', 'EXPIRED']

export const Category = sequelize.define('Category', {
  categoryId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(80), allowNull: false, unique: true },
}, { tableName: 'categories', underscored: true, timestamps: false })

export const Report = sequelize.define('Report', {
  reportId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  type: { type: DataTypes.ENUM(...REPORT_TYPES), allowNull: false },
  status: { type: DataTypes.ENUM(...REPORT_STATUS), allowNull: false, defaultValue: 'ACTIVE' },

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

  privateFeature: DataTypes.STRING(255),   // nunca sale en los DTO públicos (HU-03)

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

export const Photo = sequelize.define('Photo', {
  photoId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  filename: { type: DataTypes.STRING(120), allowNull: false },
  url: { type: DataTypes.STRING(255), allowNull: false },
}, { tableName: 'report_photos', underscored: true, updatedAt: false })

Report.hasMany(Photo, { as: 'photos', foreignKey: 'reportId', onDelete: 'CASCADE' })
Photo.belongsTo(Report, { foreignKey: 'reportId' })
Report.belongsTo(Category, { as: 'category', foreignKey: 'categoryId' })

const DEFAULT_CATEGORIES = [
  'Electrónicos', 'Documentos', 'Llaves', 'Ropa y accesorios',
  'Mochilas y bolsos', 'Libros y útiles', 'Billeteras y dinero', 'Otros',
]

/** Carga las categorías base la primera vez. */
export async function seedCategories() {
  if (await Category.count() > 0) return
  await Category.bulkCreate(DEFAULT_CATEGORIES.map((name) => ({ name })))
}
