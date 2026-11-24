/** Mount the local React renderer before Electron reveals the welcome window. */
import '@deepseek-ai/dsh-client-ui-theme/src/styles/base.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/design-platform.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/gradient-shadow-text.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/corner-shape.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/focus.css'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ExpertWelcome, Welcome } from './WelcomePage.tsx'
import type { WelcomeApi } from '../welcome-api.ts'

declare global {
  interface Window {
    dshWelcome: WelcomeApi
  }
}

const container = document.getElementById('root')
if (container === null) throw new Error('desktop welcome: missing React root')
const root = createRoot(container)
const api = window.dshWelcome
flushSync(() => {
  root.render(api.confirmExpert === undefined
    ? <Welcome api={api} />
    : <ExpertWelcome confirm={api.confirmExpert} />)
})
window.addEventListener('pagehide', () => { root.unmount() }, { once: true })
