import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { config } from '../../config.js'
import { HttpError } from './error.js'

export const UPLOAD_PATH = path.resolve(config.uploadDir)
fs.mkdirSync(UPLOAD_PATH, { recursive: true })

const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }

const storage = multer.diskStorage({
  destination: UPLOAD_PATH,
  filename: (req, file, cb) => cb(null, `${randomUUID()}${EXTENSIONS[file.mimetype]}`),
})

/** Recibe hasta MAX_PHOTOS imágenes en el campo multipart "photos". */
export const uploadPhotos = multer({
  storage,
  limits: { fileSize: config.maxPhotoMb * 1024 * 1024, files: config.maxPhotos },
  fileFilter: (req, file, cb) =>
    EXTENSIONS[file.mimetype]
      ? cb(null, true)
      : cb(new HttpError(400, 'Solo se permiten imágenes JPG, PNG, WEBP o GIF')),
}).array('photos', config.maxPhotos)

