// HU-16: cron que marca como EXPIRED los reportes sin actividad.
import cron from 'node-cron'
import { config } from '../config.js'
import { reportService } from '../services/report.service.js'

async function run() {
  try {
    const expired = await reportService.expireInactive()
    console.log(`Cron de expiración: ${expired} reporte(s) pasaron a EXPIRED`)
  } catch (e) {
    console.error(`Cron de expiración falló: ${e.message}`)
  }
}

export function startExpirationJob() {
  cron.schedule(config.expirationCron, run)
  run()   // también al arrancar, por si el servicio estuvo apagado a la hora programada
}
