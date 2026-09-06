import { AsyncLocalStorage } from 'node:async_hooks'
import type { SessionStorage } from 'remix/session'
import type { AppConfig } from './config.ts'
import type { Store } from './store.ts'

export type Runtime = { config: AppConfig; store: Store; sessions: SessionStorage }
const context = new AsyncLocalStorage<Runtime>()
export function runtime() {
  const value = context.getStore()
  if (!value) throw new Error('Missing request runtime.')
  return value
}
export const withRuntime = <T>(value: Runtime, action: () => T) => context.run(value, action)
