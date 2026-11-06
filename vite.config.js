import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        index: `${rootDir}/index.html`,
        "firebase-messaging-sw": `${rootDir}/src/firebase-messaging-sw.js`,
      },
      output: {
        entryFileNames: (chunk) => chunk.name === "firebase-messaging-sw"
          ? "[name].js"
          : "assets/[name]-[hash].js",
      },
    },
  },
});