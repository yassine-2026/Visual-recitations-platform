import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import apiRoutes from "./src/server/routes";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Validate FFmpeg presence
  if (ffmpegInstaller.path && ffprobeInstaller.path) {
    console.log(`[System] FFmpeg initialized correctly at: ${ffmpegInstaller.path}`);
    console.log(`[System] FFprobe initialized correctly at: ${ffprobeInstaller.path}`);
  } else {
    console.error("[Error] FFmpeg or FFprobe binaries are missing! Video generation will fail.");
  }

  app.use(cors());
  app.use(express.json());

  // Static files for generated outputs
  app.use('/outputs', express.static(path.join(process.cwd(), 'generated')));

  // API Routes
  app.use("/api", apiRoutes);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
