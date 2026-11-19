import 'dotenv/config'

const env = process.env

export const config = {
  appName: env.APP_NAME || 'report-service',
  port: Number(env.PORT || 8082),
  hostName: env.HOST_NAME || 'localhost',   // en Docker: "report-service"
  ipAddr: env.IP_ADDR || '127.0.0.1',       // en Docker: la IP del contenedor

  eurekaUrl: (env.EUREKA_URL || 'http://localhost:8761/eureka/').replace(/\/+$/, ''),

  db: {
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 5432),
    name: env.DB_NAME || 'reports_db',
    user: env.DB_USER || 'postgres',
    password: env.DB_PASSWORD || '',
  },

  uploadDir: env.UPLOAD_DIR || 'uploads',
  maxPhotos: Number(env.MAX_PHOTOS || 5),
  maxPhotoMb: Number(env.MAX_PHOTO_MB || 5),

  expirationDays: Number(env.EXPIRATION_DAYS || 30),
  reminderDays: Number(env.REMINDER_DAYS || 3),
  expirationCron: env.EXPIRATION_CRON || '0 2 * * *',

  // Event bus (EDA). Sin RABBITMQ_URL los eventos solo se registran en el log.
  rabbitmq: {
    url: env.RABBITMQ_URL || null,
    reportsExchange: env.REPORTS_EXCHANGE || 'reports.events',   // donde publica este servicio
    claimsExchange: env.CLAIMS_EXCHANGE || 'claims.events',      // donde publica claim-service
    claimsQueue: env.CLAIMS_QUEUE || 'report-service.claim-events',
  },
}
