// Adaptador de entrada programado: dispara los casos de uso de recordatorio (HU-25) y expiración (HU-16).
import cron from 'node-cron'

export function startExpirationJob({ sendExpirationReminders, expireInactiveReports }, schedule) {
  const run = async () => {
    try {
      const reminded = await sendExpirationReminders.execute()
      const expired = await expireInactiveReports.execute()
      console.log(`Cron de expiración: ${reminded} recordatorio(s) enviados, ${expired} reporte(s) pasaron a EXPIRED`)
    } catch (e) {
      console.error(`Cron de expiración falló: ${e.message}`)
    }
  }
  cron.schedule(schedule, run)
  run()   // también al arrancar, por si el servicio estuvo apagado a la hora programada
}
