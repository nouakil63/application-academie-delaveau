import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

export default defineConfig({
  plugins:[{
    name:"emit-service-worker",
    generateBundle(){this.emitFile({type:"asset",fileName:"service-worker.js",source:readFileSync("service-worker.js","utf8")});}
  }],
  build: {
    rollupOptions: {
      output: {
        assetFileNames: asset => asset.name === "manifest.webmanifest" ? "[name][extname]" : "assets/[name][extname]"
      }
    }
  }
});
