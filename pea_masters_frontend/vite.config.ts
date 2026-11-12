import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  resolve:{
    alias:{
       "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // The FastAPI backend (pea_masters_backend). Going through this dev server keeps the app and the API on one
    // origin, so the httpOnly login cookie just works and Google redirects back to http://localhost:5173.
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
})
