import JSON5 from 'json5'
import { Context, Schema } from 'koishi'
import { HTTP } from 'undios'

import { CacheManager } from '../cache'
import { randomItem } from '../utils'

export function extractName(url: string) {
  return url.slice(url.lastIndexOf('/') + 1)
}

export function extractStem(url: string) {
  url = extractName(url)
  return url.slice(0, url.lastIndexOf('.'))
}

export interface OriginInfo {
  originIdentifier: string
  originName: string
}
export interface MemeInfo extends OriginInfo {
  name: string
  url: string
}
export type MemeInfoWithData = Omit<MemeInfo, 'url'> & { data: Blob }

export class MemeBoxOrigin {
  public readonly identifier: string
  public readonly displayName: string
  protected http: HTTP
  protected cache: CacheManager
  protected memeList: Record<string, string>

  constructor(
    protected ctx: Context,
    config: MemeBoxOrigin.Config,
  ) {
    this.identifier = config.identifier
    this.displayName = config.displayName || config.identifier
    this.http = ctx.http.extend(config.requestConfig)
    this.cache = new CacheManager(config.identifier)
  }

  protected get infoConst(): OriginInfo {
    return {
      originIdentifier: this.identifier,
      originName: this.displayName,
    }
  }

  async updateList() {
    const { items }: { items: string[] } = JSON5.parse(
      (
        await this.http.get('/static/scripts/config.js', {
          responseType: 'text',
        })
      ).replace('export default {', '{'),
    )
    this.ctx.logger.info(
      `Got ${items.length} memes from source ${this.identifier}.`,
    )
    this.memeList = Object.fromEntries(
      items.map((url) => [extractStem(url), url]),
    )
    return this.memeList
  }

  async getList() {
    if (!this.memeList) return this.updateList()
    return this.memeList
  }

  async fetchMeme(url: string): Promise<MemeInfoWithData> {
    const blob = await this.cache.readOrGet(extractName(url), async () =>
      this.http.get(url.startsWith('/') ? url : `/${url}`, {
        responseType: 'blob',
      }),
    )
    return { ...this.infoConst, name: extractName(url), data: blob }
  }

  async getMemeByName(name: string): Promise<MemeInfo> {
    const url = this.memeList[name]
    if (!url) throw new Error(`Meme ${name} not found`)
    return { ...this.infoConst, name, url }
  }

  async searchMemeInternal(keyword: string): Promise<[number, MemeInfo][]> {
    const list = Object.entries(await this.getList())
    const params = keyword.toLowerCase().split(/\s/g)

    const result: [number, [string, string]][] = []
    for (const it of list) {
      const score = params.reduce(
        (acc, cur) => acc + (it[0].includes(cur) ? 1 : 0),
        0,
      )
      if (score) result.push([score, it])
    }

    return result
      .sort(([a], [b]) => b - a)
      .map(([score, [name, url]]) => [score, { ...this.infoConst, name, url }])
  }

  async searchMeme(keyword: string) {
    return (await this.searchMemeInternal(keyword)).map(([, v]) => v)
  }

  async randomMeme(): Promise<MemeInfo> {
    const [name, url] = randomItem(Object.entries(await this.getList()))
    return { ...this.infoConst, name, url }
  }
}

export namespace MemeBoxOrigin {
  export interface Config {
    identifier: string
    displayName?: string
    shortcuts: string[]
    requestConfig?: HTTP.Config
  }

  export const Config: Schema<Config> = Schema.object({
    identifier: Schema.string().required(),
    displayName: Schema.string(),
    shortcuts: Schema.array(Schema.string()).default([]),
    requestConfig: HTTP.createConfig(true),
  })
}
