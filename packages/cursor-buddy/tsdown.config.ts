import fs from "node:fs"
import path from "node:path"
import type { Plugin } from "rolldown"
import { defineConfig } from "tsdown"

/**
 * Rolldown plugin to handle CSS ?inline imports.
 * Reads the CSS file and exports it as a string.
 */
const cssInlinePlugin: Plugin = {
  name: "css-inline",

  resolveId(id, importer) {
    if (id.endsWith(".css?inline") && importer) {
      const importerDir = path.dirname(importer)
      const cssPath = id.replace("?inline", "")
      const absolutePath = path.resolve(importerDir, cssPath)
      return `${absolutePath}?inline`
    }
  },

  load(id) {
    if (!id.endsWith(".css?inline")) return null

    const filePath = id.replace("?inline", "")

    try {
      const cssContent = fs.readFileSync(filePath, "utf-8")
      return {
        code: `export default ${JSON.stringify(cssContent)};`,
        moduleType: "js",
      }
    } catch (error) {
      console.error(`Failed to load CSS inline: ${filePath}`, error)
      return null
    }
  },
}

/**
 * Plugin to add "use client" directive to React bundle.
 */
const useClientPlugin: Plugin = {
  name: "use-client",

  renderChunk(code, chunk) {
    // Add "use client" to React entry chunks
    if (chunk.fileName.includes("react/index")) {
      return {
        code: `"use client";\n${code}`,
        map: null,
      }
    }
  },
}

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/react/index.ts",
    "src/server/index.ts",
    "src/server/adapters/next.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  deps: {
    neverBundle: ["react", "react-dom"],
  },
  plugins: [cssInlinePlugin, useClientPlugin],
})
