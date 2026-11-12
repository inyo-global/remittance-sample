import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    // Listen on IPv4 loopback too: by default Vite binds only [::1] here, and lvh.me resolves to 127.0.0.1.
    host: '127.0.0.1',
    // The KYC widget redirect cannot target localhost (Inyo's WAF blocks loopback hosts), so the
    // app is also served under a hosts-file alias such as remittance-sample.local (see APP_URL).
    allowedHosts: ['lvh.me', '.local', '.test', '.ngrok-free.app', '.ngrok.app', '.ngrok.io'],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
