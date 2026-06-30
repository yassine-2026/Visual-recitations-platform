import { Router } from "express";
import { generateVideo, checkStatus, getJobsList } from "./videoService";
import path from "path";
import fs from "fs";

const router = Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

router.post("/generate", async (req, res) => {
  try {
    const job = await generateVideo(req.body);
    res.json(job);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/status/:jobId", (req, res) => {
  const status = checkStatus(req.params.jobId);
  if (!status) {
    return res.status(404).json({ error: "Job not found" });
  }
  res.json(status);
});

router.get("/download/:jobId", (req, res) => {
  const jobId = req.params.jobId;
  const filePath = path.join(process.cwd(), 'generated', `${jobId}.mp4`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  res.download(filePath, `quran-video-${jobId}.mp4`);
});

router.get("/jobs", (req, res) => {
  res.json(getJobsList());
});

export default router;
