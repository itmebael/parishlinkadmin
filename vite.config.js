import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Browsers request `/favicon.ico` even when not linked; serve the SVG so the console stays clean. */
function serveFaviconIco() {
  return {
    name: "serve-favicon-ico",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.headers.upgrade === "websocket") {
          next();
          return;
        }
        const u = req.url?.split("?")[0] ?? "";
        if (u !== "/favicon.ico") {
          next();
          return;
        }
        const svg = path.join(__dirname, "public", "favicon.svg");
        if (!fs.existsSync(svg)) {
          next();
          return;
        }
        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Cache-Control", "public, max-age=86400");
        fs.createReadStream(svg).pipe(res);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const rawHmr = env.VITE_HMR_CLIENT_PORT;
  const hmrClientPort =
    rawHmr != null && rawHmr !== "" ? Number(rawHmr) : undefined;
  const devPort = Number(env.VITE_DEV_PORT || 5180);
  const port =
    Number.isFinite(devPort) && devPort > 0 ? devPort : 5180;
  /** Set VITE_STRICT_PORT=true in .env.local if you must fail when `port` is taken (default: try next port). */
  const strictPort =
    String(env.VITE_STRICT_PORT || "").toLowerCase() === "true";

  return {
    base: "./",
    plugins: [react(), serveFaviconIco()],
    server: {
      // Browser verification artifacts are not application sources.
      watch: { ignored: ["**/.design-browser*/**", "**/.admin-browser*/**", "**/.design-preview/**", "**/site-build/**"] },
      port,
      strictPort,
      host: "0.0.0.0",
      hmr: {
        host: "localhost",
        ...(hmrClientPort != null && !Number.isNaN(hmrClientPort)
          ? { clientPort: hmrClientPort }
          : {}),
      },
    },
  };
});
