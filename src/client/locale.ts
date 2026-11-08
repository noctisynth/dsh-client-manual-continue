import enResource from '../../locale/en.json' with { type: 'json' }
import zhResource from '../../locale/zh.json' with { type: 'json' }

export const localeNamespace = 'dsh-client-manual-continue'
const { meta: enMeta, ...enText } = enResource
const { meta: zhMeta, ...zhText } = zhResource
export type LocaleKey = keyof typeof enText | 'meta.title' | 'meta.description'
export const dictionaries = {
  en: { ...enText, 'meta.title': enMeta.title, 'meta.description': enMeta.description },
  zh: { ...zhText, 'meta.title': zhMeta.title, 'meta.description': zhMeta.description },
} satisfies Record<'en' | 'zh', Record<LocaleKey, string>>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-client-manual-continue': LocaleKey
  }
}
