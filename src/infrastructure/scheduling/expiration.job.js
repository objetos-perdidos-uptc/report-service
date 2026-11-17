// Adaptador de entrada programado (HU-16): dispara el caso de uso ExpireInactiveReports.
import cron from 'node-cron'

export function startExpirationJob(expireInactiveReports, schedule) {
  const run = async () => {
    try {
      const expired = await expireInactiveReports.execute()
      console.log(`Cron de expiración: ${expired} reporte(s) pasaron a EXPIRED`)
    } catch (e) {
      console.error(`Cron de expiración falló: ${e.message}`)
    }
  }
  cron.schedule(schedule, run)
  run()   // también al arrancar, por si el servicio estuvo apagado a la hora programada
}
