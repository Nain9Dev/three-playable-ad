import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

// The ad networks accept one HTML file with every asset inlined, so the build
// folds the JavaScript and CSS into dist/index.html.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: {
    target: "es2019",
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    // The default module-preload polyfill calls fetch(), and the network specs forbid
    // network calls. The validator caught this on the first build.
    modulePreload: false,
    reportCompressedSize: false,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
