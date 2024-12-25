import { Context, HTTP, Schema, Service } from 'koishi'

import { name } from '../const'
import { randomItem } from '../utils'
import { MemeBoxOrigin } from './source'

declare module 'koishi' {
  interface Context {
    memebox: MemeBox
  }
}

export class MemeBox extends Service<MemeBox.Config> {
  static [Service.provide] = name

  static Origin = MemeBoxOrigin
  protected sources: MemeBoxOrigin[] = []

  constructor(
    protected ctx: Context,
    config: MemeBox.Config,
  ) {
    super(ctx, name)
    for (const origin of config.origins) {
      const requestConfig = HTTP.mergeConfig(config.requestConfig, origin.requestConfig)
      const cls = new MemeBoxOrigin(ctx, { ...origin, requestConfig })
      this.sources.push(cls)
    }
  }

  getSource(identifier: string) {
    const source = this.sources.find((source) => source.identifier === identifier)
    if (!source) throw new Error(`Source ${identifier} not found`)
    return source
  }

  getSourceList() {
    return [...this.sources]
  }

  async updateAll() {
    await Promise.all(this.sources.map((source) => source.updateList()))
  }

  async randomMeme() {
    const memes = (
      await Promise.all(
        this.sources.flatMap(async (source) =>
          Object.keys(await source.getList()).map(
            (key) => [source, key] as [MemeBoxOrigin, string],
          ),
        ),
      )
    ).flat()
    const [source, key] = randomItem(memes)
    return source.getMemeByName(key)
  }

  async searchMemeInternal(keyword: string) {
    return (
      await Promise.all(
        this.sources.map((source) => source.searchMemeInternal(keyword)),
      )
    )
      .flat()
      .sort()
  }

  async searchMeme(keyword: string) {
    return (await this.searchMemeInternal(keyword)).map(([, v]) => v)
  }
}

export const defaultOrigins: MemeBoxOrigin.Config[] = [
  {
    identifier: 'koishi',
    displayName: 'Koishi Meme',
    shortcuts: ['koishi-meme', 'koishi草图'],
    requestConfig: { endpoint: 'https://memes.none.bot/' },
  },
  {
    identifier: 'nonebot',
    displayName: 'NoneMeme',
    shortcuts: ['nonememe', 'nb草图'],
    requestConfig: { endpoint: 'https://nonememe.icu/' },
  },
]

export namespace MemeBox {
  export interface Origin extends MemeBoxOrigin {}

  export interface Config {
    origins: MemeBoxOrigin.Config[]
    requestConfig: HTTP.Config
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      origins: Schema.array(MemeBoxOrigin.Config).default(defaultOrigins),
    }),
    Schema.object({ requestConfig: HTTP.createConfig() }),
  ])
}
