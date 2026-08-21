// Vitest stub for the VitePWA `virtual:pwa-register` module.
// The real module is provided by `vite-plugin-pwa` in dev/production; tests
// alias here so the component can be rendered in jsdom without a real SW.
export function registerSW() {
  return () => Promise.resolve();
}
