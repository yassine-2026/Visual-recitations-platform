import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { QuranService } from '../services/quranService';
import { pipeline } from 'stream/promises';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const GENERATED_DIR = path.join(process.cwd(), 'generated');
const TEMP_DIR = path.join(process.cwd(), 'temp');

if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

export interface VideoRequest {
  surahNumber: number;
  startAyah: number;
  endAyah: number;
  reciter: string;
  bgType: string;
  resolutionHeight: number;
}

export interface JobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  videoUrl?: string;
  thumbnailUrl?: string;
}

const jobs = new Map<string, JobStatus>();

export function checkStatus(jobId: string): JobStatus | undefined {
  return jobs.get(jobId);
}

export function getJobsList(): JobStatus[] {
  return Array.from(jobs.values()).reverse();
}

async function downloadFileStream(url: string, dest: string, signal: AbortSignal): Promise<void> {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    signal,
    timeout: 30000 // 30 seconds for download
  });
  
  await pipeline(response.data, fs.createWriteStream(dest), { signal });
}

export async function generateVideo(req: VideoRequest): Promise<JobStatus> {
  if (!ffmpegInstaller.path || !ffprobeInstaller.path) {
    throw new Error('الخادم غير قادر على معالجة الفيديوهات حالياً بسبب خطأ داخلي (FFmpeg غير متوفر).');
  }

  const activeJobs = Array.from(jobs.values()).filter(j => j.status === 'pending' || j.status === 'processing');
  if (activeJobs.length >= 1) {
    throw new Error('الخادم يقوم حالياً بمعالجة فيديو آخر. يرجى الانتظار حتى ينتهي.');
  }

  const jobId = uuidv4();
  console.log(`[Job ${jobId}] [1/10] Request received`);
  const job: JobStatus = {
    id: jobId,
    status: 'pending',
    progress: 0,
    message: 'Starting job...'
  };
  jobs.set(jobId, job);

  // Run asynchronously
  processVideo(jobId, req).catch(err => {
    console.error(`[Job ${jobId}] Execution failed:`);
    console.error(err.stack || err);
    const failedJob = jobs.get(jobId);
    if (failedJob) {
      failedJob.status = 'failed';
      failedJob.message = err.message || 'Unknown error occurred';
    }
  });

  return job;
}

async function processVideo(jobId: string, req: VideoRequest) {
  const job = jobs.get(jobId)!;
  const jobTempDir = path.join(TEMP_DIR, jobId);
  
  const controller = new AbortController();
  const signal = controller.signal;
  
  const memInterval = setInterval(() => {
    const mem = process.memoryUsage();
    console.log(`[Job ${jobId}] Memory: RSS=${Math.round(mem.rss / 1024 / 1024)}MB, HeapUsed=${Math.round(mem.heapUsed / 1024 / 1024)}MB, HeapTotal=${Math.round(mem.heapTotal / 1024 / 1024)}MB, External=${Math.round(mem.external / 1024 / 1024)}MB`);
    if (mem.rss > 409 * 1024 * 1024) { // 80% of 512MB
      console.error(`[Job ${jobId}] Memory limit exceeded (80%). Aborting.`);
      controller.abort(new Error('Memory limit exceeded (80%). Process aborted.'));
    }
  }, 5000);

  const timeoutHandle = setTimeout(() => {
    console.error(`[Job ${jobId}] Timeout exceeded (5 minutes). Aborting.`);
    controller.abort(new Error('Operation timed out after 5 minutes.'));
  }, 5 * 60 * 1000);

  try {
    fs.mkdirSync(jobTempDir, { recursive: true });
    console.log(`[Job ${jobId}] [2/10] Temporary folder created`);

    job.status = 'processing';
    job.message = 'Fetching Quran audio...';
    job.progress = 10;
    console.log(`[Job ${jobId}] [3/10] Downloading Quran audio`);
    
    const audioFiles: string[] = [];
    const concatFilePath = path.join(jobTempDir, 'concat.txt');
    let concatContent = '';

    for (let i = req.startAyah; i <= req.endAyah; i++) {
      if (signal.aborted) throw signal.reason;
      
      const audioUrl = await QuranService.getAyahAudio(req.surahNumber, i, req.reciter);
      const destFile = path.join(jobTempDir, `ayah_${i}.mp3`);
      
      await downloadFileStream(audioUrl, destFile, signal);
      
      const safePath = destFile.replace(/\\/g, '/');
      concatContent += `file '${safePath}'\n`;
      audioFiles.push(destFile);
    }

    fs.writeFileSync(concatFilePath, concatContent);
    console.log(`[Job ${jobId}] [4/10] Quran audio downloaded`);

    job.message = 'Merging audio files...';
    job.progress = 30;
    const fullAudioPath = path.join(jobTempDir, 'full_audio.mp3');
    
    await runFfmpegCommand(
      ffmpeg()
        .input(concatFilePath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
            '-c', 'copy',
            '-threads', '1'
        ])
        .output(fullAudioPath)
        .on('start', (cmd) => console.log(`[Job ${jobId}] FFmpeg Concat CMD: ${cmd}`)),
      signal,
      jobId,
      'Audio merge failed'
    );

    if (!fs.existsSync(fullAudioPath) || fs.statSync(fullAudioPath).size === 0) {
      throw new Error('Generated full audio file is missing or empty.');
    }

    job.message = 'Downloading background video...';
    job.progress = 50;
    console.log(`[Job ${jobId}] [5/10] Downloading background`);

    const pexelsKey = process.env.PEXELS_API_KEY;
    if (!pexelsKey) {
      throw new Error('PEXELS_API_KEY is not set in environment variables.');
    }

    const pexelsResponse = await axios.get(`https://api.pexels.com/videos/search?query=${encodeURIComponent(req.bgType)}&per_page=5&orientation=landscape`, {
      headers: { Authorization: pexelsKey },
      signal,
      timeout: 10000 // 10 seconds timeout for Pexels search
    });

    if (!pexelsResponse.data.videos || pexelsResponse.data.videos.length === 0) {
      throw new Error('No backgrounds found for the requested topic.');
    }

    const randomVideo = pexelsResponse.data.videos[Math.floor(Math.random() * pexelsResponse.data.videos.length)];
    const videoFiles = randomVideo.video_files.sort((a: any, b: any) => (b.width * b.height) - (a.width * a.height));
    const bgUrl = videoFiles[0].link;
    
    const bgVideoPath = path.join(jobTempDir, 'bg.mp4');
    await downloadFileStream(bgUrl, bgVideoPath, signal);

    if (!fs.existsSync(bgVideoPath) || fs.statSync(bgVideoPath).size === 0) {
      throw new Error('Downloaded background video is missing or empty.');
    }
    console.log(`[Job ${jobId}] [6/10] Background downloaded`);

    job.message = 'Generating final video...';
    job.progress = 70;
    console.log(`[Job ${jobId}] [7/10] Starting FFmpeg`);
    const finalVideoPath = path.join(GENERATED_DIR, `${jobId}.mp4`);
    
    await runFfmpegCommand(
      ffmpeg()
        .input(bgVideoPath)
        .inputOptions(['-stream_loop', '-1'])
        .input(fullAudioPath)
        .outputOptions([
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-pix_fmt', 'yuv420p',
          '-shortest',
          '-vf', `scale=-2:${req.resolutionHeight},format=yuv420p`,
          '-preset', 'ultrafast',
          '-movflags', '+faststart',
          '-threads', '1'
        ])
        .output(finalVideoPath)
        .on('start', (cmd) => console.log(`[Job ${jobId}] FFmpeg Merge CMD: ${cmd}`)),
      signal,
      jobId,
      'Video generation failed'
    );

    if (!fs.existsSync(finalVideoPath) || fs.statSync(finalVideoPath).size === 0) {
      throw new Error('Final generated video is missing or empty.');
    }
    console.log(`[Job ${jobId}] [8/10] FFmpeg finished`);

    job.message = 'Creating thumbnail...';
    job.progress = 95;
    const thumbnailPath = path.join(GENERATED_DIR, `${jobId}.jpg`);
    
    await runFfmpegCommand(
      ffmpeg(finalVideoPath)
        .outputOptions([
          '-ss', '00:00:01.000',
          '-vframes', '1',
          '-vf', `scale=-2:${req.resolutionHeight}`,
          '-threads', '1',
          '-q:v', '2'
        ])
        .output(thumbnailPath)
        .on('start', (cmd) => console.log(`[Job ${jobId}] FFmpeg Thumb CMD: ${cmd}`)),
      signal,
      jobId,
      'Thumbnail generation failed'
    );

    job.status = 'completed';
    job.progress = 100;
    job.message = 'Video created successfully!';
    job.videoUrl = `/outputs/${jobId}.mp4`;
    job.thumbnailUrl = `/outputs/${jobId}.jpg`;

    console.log(`[Job ${jobId}] [9/10] Cleaning temporary files`);
    try {
      fs.rmSync(jobTempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.error(`[Job ${jobId}] Failed to cleanup temp dir:`, cleanupErr);
    }

    console.log(`[Job ${jobId}] [10/10] Returning final video`);

  } catch (error: any) {
    console.log(`[Job ${jobId}] [9/10] Cleaning temporary files (Error branch)`);
    try {
      if (fs.existsSync(jobTempDir)) {
        fs.rmSync(jobTempDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      console.error(`[Job ${jobId}] Failed to cleanup temp dir:`, cleanupErr);
    }
    throw error;
  } finally {
    clearInterval(memInterval);
    clearTimeout(timeoutHandle);
  }
}

function runFfmpegCommand(
  cmd: ffmpeg.FfmpegCommand, 
  signal: AbortSignal, 
  jobId: string,
  errorPrefix: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderrLog = '';
    
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      cmd.kill('SIGKILL');
      reject(signal.reason || new Error('Aborted'));
    };
    
    if (signal.aborted) {
      return onAbort();
    }
    
    signal.addEventListener('abort', onAbort);
    
    cmd.on('stderr', (line) => {
      stderrLog += line + '\n';
    });
    
    cmd.on('end', () => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    });
    
    cmd.on('error', (err) => {
      signal.removeEventListener('abort', onAbort);
      console.error(`[Job ${jobId}] FFmpeg Error:`, err.message);
      reject(new Error(`${errorPrefix}: ${err.message}\nLogs: ${stderrLog}`));
    });
    
    cmd.run();
  });
}
