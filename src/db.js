import pg from 'pg'
import { Sequelize } from 'sequelize'
import { config } from './config.js'

const { host, port, name, user, password } = config.db

export const sequelize = new Sequelize(name, user, password, {
  host,
  port,
  dialect: 'postgres',
  logging: false,
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Crea la base de datos del servicio si aún no existe. */
async function ensureDatabase() {
  const client = new pg.Client({ host, port, user, password, database: 'postgres' })
  await client.connect()
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (rowCount === 0) {
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`)
      console.log(`PostgreSQL: base de datos ${name} creada`)
    }
  } finally {
    await client.end()
  }
}

/** Conecta (con reintentos, por si Postgres aún está arrancando) y crea las tablas. */
export async function initDb() {
  for (let intento = 1; ; intento++) {
    try {
      await ensureDatabase()
      await sequelize.authenticate()
      break
    } catch (e) {
      if (intento >= 10) throw e
      console.warn(`PostgreSQL no disponible (intento ${intento}): ${e.message}`)
      await sleep(3000)
    }
  }
  await sequelize.sync()
  console.log(`PostgreSQL conectado: ${host}:${port}/${name}`)
}
