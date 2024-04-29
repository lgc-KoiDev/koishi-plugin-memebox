import fsSync from 'fs'
import fs from 'fs/promises'
import { join } from 'path'

import { name } from './const'

export const metaSuffix = '.meta.json'
export interface CacheMeta {
  type: string
}

export class CacheManager {
  public readonly basePath: string

  constructor(public readonly folderName: string) {
    this.basePath = join(process.cwd(), 'cache', name, folderName)
  }

  async ensurePath() {
    if (!fsSync.existsSync(this.basePath)) {
      await fs.mkdir(this.basePath, { recursive: true })
    }
  }

  getFilePath(fileName: string) {
    return join(this.basePath, fileName)
  }

  async write(fileName: string, data: Blob) {
    await this.ensurePath()
    const path = this.getFilePath(fileName)
    const metaPath = `${path}${metaSuffix}`

    await fs.writeFile(path, Buffer.from(await data.arrayBuffer()))
    await fs.writeFile(metaPath, JSON.stringify({ type: data.type }))
  }

  async read(fileName: string): Promise<Blob | null> {
    const path = this.getFilePath(fileName)
    const metaPath = `${path}${metaSuffix}`

    if (!(fsSync.existsSync(path) && fsSync.existsSync(metaPath))) {
      return null
    }

    const data = await fs.readFile(path)
    const { type }: CacheMeta = JSON.parse(await fs.readFile(metaPath, 'utf-8'))
    return new Blob([data], { type })
  }

  async readOrGet(
    filename: string,
    getter: () => Promise<Blob>,
  ): Promise<Blob> {
    let blob = await this.read(filename)
    if (blob) return blob

    blob = await getter()
    await this.write(filename, blob)
    return blob
  }
}
