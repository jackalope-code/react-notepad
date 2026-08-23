import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import {VitePWA} from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/react-notepad/',
  plugins: [
    react(),
    VitePWA({
      // 'prompt' leaves control of when to activate a new service worker
      // (and thus when the page reloads onto new assets) to the user via
      // PwaReloadPrompt's Reload button. 'autoUpdate' would activate and
      // reload in the background without asking, which conflicts with
      // that UI.
      registerType: 'prompt',
      devOptions: {
        enabled: true
      }
    }),

  ],
  build: {
    outDir: 'build',
  }
})
