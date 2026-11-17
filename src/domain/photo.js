// Entidad Photo: pertenece al agregado Report y solo se modifica a través de él.

export class Photo {
  constructor({ photoId = null, filename, url, createdAt = null }) {
    this.photoId = photoId
    this.filename = filename
    this.url = url
    this.createdAt = createdAt
  }

  static create(filename) {
    return new Photo({ filename, url: `/reports/photos/${filename}` })
  }
}
