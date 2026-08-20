import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        assetFileNames: asset => asset.name === "manifest.webmanifest" ? "[name][extname]" : "assets/[name][extname]"
      }
    }
  }
});
