import { Context, h, Schema } from 'koishi'
import {} from 'koishi-plugin-cron'
import { HTTP } from 'undios'

import { name } from './const'
import zhCNLocale from './locales/zh-CN.yml'
import { MemeBox } from './service'
import { MemeBoxOrigin, MemeInfo, MemeInfoWithData } from './service/source'

export { name }
export const inject = ['cron']

export interface Config extends MemeBox.Config {
  updateCron: string
  maxListCount: number
}
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    updateCron: Schema.string()
      .pattern(/^((((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*) ?){5,7})$/)
      .default('0 * * * *'),
    maxListCount: Schema.number().default(5),
  }),
  ...MemeBox.Config.list,
]).i18n({
  'zh-CN': zhCNLocale._config,
  zh: zhCNLocale._config,
})

export function apply(ctx: Context, config: Config) {
  ctx.i18n.define('zh-CN', zhCNLocale)
  ctx.i18n.define('zh', zhCNLocale)

  ctx.plugin(MemeBox, config)
  ctx.inject([name], (ctx) => {
    const updateAll = () =>
      ctx.memebox.updateAll().catch((e) => ctx.logger.warn(e))
    ctx.cron(config.updateCron, updateAll)
    // updateAll()

    const cmd = ctx
      .command('memebox [keyword:text]')
      .option('source', '-s [source:string]')

    for (const source of config.origins) {
      for (const shortcut of source.shortcuts) {
        cmd.alias(shortcut, { options: { source: source.identifier } })
      }
    }

    cmd.subcommand('.list').action(async ({ session }) =>
      session.text('.source-list', [
        ctx.memebox
          .getSourceList()
          .map((source) =>
            session.text('.item-in-source-list', [
              source.identifier,
              source.displayName,
            ]),
          )
          .join('\n'),
      ]),
    )

    cmd.action(async ({ session, options }, keyword) => {
      // if (!name) return session.execute('help memebox')
      if (keyword === 'list') return session.execute('memebox.list')

      const warnHttpErr = (e: any, msg: string) => {
        ctx.logger.warn(e)
        return HTTP.Error.is(e)
          ? session.text(msg)
          : session.text('internal.error-encountered')
      }

      let source: MemeBox | MemeBoxOrigin
      try {
        source = options.source
          ? ctx.memebox.getSource(options.source)
          : ctx.memebox
      } catch (e) {
        return session.text('.source-not-found')
      }

      let searchResult: MemeInfo[]
      try {
        searchResult = keyword
          ? await source.searchMeme(keyword)
          : [await source.randomMeme()]
      } catch (e) {
        return warnHttpErr(e, '.fetch-list-failed')
      }
      if (!searchResult) return session.text('.meme-not-found')

      let selectedMeme: MemeInfo
      if (searchResult.length === 1) {
        selectedMeme = searchResult[0]
      } else {
        session.send(
          session.text('.multiple-memes-found', [
            searchResult
              .slice(0, config.maxListCount)
              .map((meme, i) =>
                session.text('.item-in-list', [i + 1, meme.name]),
              )
              .join('\n'),
          ]),
        )
        const reply = await session.prompt()
        if (reply === undefined) return

        const index = parseInt(reply)
        if (isNaN(index) || index < 1 || index > searchResult.length) {
          return session.text('.invalid-input-quit')
        }
        selectedMeme = searchResult[index - 1]
      }

      let resp: MemeInfoWithData
      try {
        const actualSource = ctx.memebox.getSource(
          selectedMeme.originIdentifier,
        )
        resp = await actualSource.fetchMeme(selectedMeme.url)
      } catch (e) {
        return warnHttpErr(e, '.fetch-image-failed')
      }

      return session.text('.meme-info', [
        selectedMeme.name,
        h.image(await resp.data.arrayBuffer(), resp.data.type),
        selectedMeme.originName,
      ])
    })
  })
}
