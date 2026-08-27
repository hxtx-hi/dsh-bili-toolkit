import { clientBundle } from './build/tsdown.client.ts'

export default clientBundle('dsh-bilibili-search', ['src/index.ts'], {
  portableCssModuleIds: true,
  libExternal: ['@deepseek-ai/dsh-tools'],
})
