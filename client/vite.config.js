import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from "vite-plugin-top-level-await";

// // Serve .wasm files with 'application/wasm' MIME type
// export function configureServer(server) {
//   console.log("configure server")
//   server.middlewares.use((req, res, next) => {
//     console.log("req.originalUrl", req.originalUrl)
//     if (req.originalUrl.endsWith('.wasm')) {
//       console.log("Setting that header!!!!!!!!!!!!!!!!!!")
//       console.log("req.originalUrl", req.originalUrl)
//       res.setHeader('Content-Type', 'application/wasm');
//       console.log("RES", res)
//     }
//     next();
//   });
// }

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // {
    //   name: 'configure-server', configureServer
    // },
    react(), 
    wasm(),
    topLevelAwait(),
    
  ],
})
