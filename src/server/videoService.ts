import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { QuranService } from '../services/quranService';

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

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });
  
  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(dest);
    response.data.pipe(writer);
    writer.on('finish', () => {
      writer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    writer.on('error', (err) => {
      writer.close();
      reject(err);
    });
  });
}

export async function generateVideo(req: VideoRequest): Promise<JobStatus> {
  const jobId = uuidv4();
  const job: JobStatus = {
    id: jobId,
    status: 'pending',
    progress: 0,
    message: 'Starting job...'
  };
  jobs.set(jobId, job);

  // Run asynchronously
  processVideo(jobId, req).catch(err => {
    console.error(`Job ${jobId} failed:`, err);
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
  fs.mkdirSync(jobTempDir, { recursive: true });

  try {
    // 1. Fetch Ayah Audios
    job.status = 'processing';
    job.message = 'Fetching Quran audio...';
    job.progress = 10;
    
    const audioFiles: string[] = [];
    const concatFilePath = path.join(jobTempDir, 'concat.txt');
    let concatContent = '';

    for (let i = req.startAyah; i <= req.endAyah; i++) {
      const audioUrl = await QuranService.getAyahAudio(req.surahNumber, i, req.reciter);
      
      const destFile = path.join(jobTempDir, `ayah_${i}.mp3`);
      await downloadFile(audioUrl, destFile);
      
      // FFmpeg concat format
      const safePath = destFile.replace(/\\/g, '/');
      concatContent += `file '${safePath}'\n`;
      audioFiles.push(destFile);
    }

    fs.writeFileSync(concatFilePath, concatContent);

    // 2. Concat Audio
    job.message = 'Merging audio files...';
    job.progress = 30;
    const fullAudioPath = path.join(jobTempDir, 'full_audio.mp3');
    
    await new Promise<void>((resolve, reject) => {
      let concatStderr = '';
      ffmpeg()
        .input(concatFilePath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])
        .output(fullAudioPath)
        .on('start', (cmd) => console.log(`[FFmpeg Concat] ${cmd}`))
        .on('stderr', (line) => {
          concatStderr += line + '\n';
        })
        .on('end', () => resolve())
        .on('error', (err) => {
          console.error('[FFmpeg Concat Error]', err.message);
          reject(new Error(`Audio merge failed: ${err.message}\nLogs: ${concatStderr}`));
        })
        .run();
    });

    if (!fs.existsSync(fullAudioPath) || fs.statSync(fullAudioPath).size === 0) {
      throw new Error('Generated full audio file is missing or empty.');
    }

    // 3. Fetch Background from Pexels
    job.message = 'Downloading background video...';
    job.progress = 50;

    const pexelsKey = process.env.PEXELS_API_KEY;
    if (!pexelsKey) {
      throw new Error('PEXELS_API_KEY is not set in environment variables.');
    }

    const pexelsResponse = await axios.get(`https://api.pexels.com/videos/search?query=${encodeURIComponent(req.bgType)}&per_page=5&orientation=landscape`, {
      headers: { Authorization: pexelsKey }
    });

    if (!pexelsResponse.data.videos || pexelsResponse.data.videos.length === 0) {
      throw new Error('No backgrounds found for the requested topic.');
    }

    // Pick a random video from top 5
    const randomVideo = pexelsResponse.data.videos[Math.floor(Math.random() * pexelsResponse.data.videos.length)];
    // Get best quality link (preferably HD)
    const videoFiles = randomVideo.video_files.sort((a: any, b: any) => (b.width * b.height) - (a.width * a.height));
    const bgUrl = videoFiles[0].link;
    
    const bgVideoPath = path.join(jobTempDir, 'bg.mp4');
    await downloadFile(bgUrl, bgVideoPath);

    if (!fs.existsSync(bgVideoPath) || fs.statSync(bgVideoPath).size === 0) {
      throw new Error('Downloaded background video is missing or empty.');
    }

    // 4. Merge Audio and Video
    job.message = 'Generating final video...';
    job.progress = 70;
    const finalVideoPath = path.join(GENERATED_DIR, `${jobId}.mp4`);
    
    await new Promise<void>((resolve, reject) => {
      let mergeStderr = '';
      ffmpeg()
        .input(bgVideoPath)
        .inputOptions(['-stream_loop', '-1'])
        .input(fullAudioPath)
        .outputOptions([
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-pix_fmt', 'yuv420p',
          '-shortest',
          // Use -2 to automatically calculate width preserving aspect ratio, preventing 'trunc' syntax errors
          '-vf', `scale=-2:${req.resolutionHeight},format=yuv420p`,
          '-preset', 'fast'
        ])
        .output(finalVideoPath)
        .on('start', (cmd) => console.log(`[FFmpeg Merge] ${cmd}`))
        .on('stderr', (line) => {
          mergeStderr += line + '\n';
        })
        .on('end', () => resolve())
        .on('error', (err) => {
          console.error('[FFmpeg Merge Error]', err.message);
          reject(new Error(`Video generation failed: ${err.message}\nLogs: ${mergeStderr}`));
        })
        .run();
    });

    if (!fs.existsSync(finalVideoPath) || fs.statSync(finalVideoPath).size === 0) {
      throw new Error('Final generated video is missing or empty.');
    }

    // 5. Generate Thumbnail
    job.message = 'Creating thumbnail...';
    job.progress = 95;
    const thumbnailPath = path.join(GENERATED_DIR, `${jobId}.jpg`);
    
    await new Promise<void>((resolve, reject) => {
      let thumbStderr = '';
      ffmpeg(finalVideoPath)
        .screenshots({
          timestamps: ['00:00:01.000'],
          filename: `${jobId}.jpg`,
          folder: GENERATED_DIR,
          size: `?x${req.resolutionHeight}`
        })
        .on('start', (cmd) => console.log(`[FFmpeg Thumb] ${cmd}`))
        .on('stderr', (line) => {
          thumbStderr += line + '\n';
        })
        .on('end', () => resolve())
        .on('error', (err) => {
          console.error('[FFmpeg Thumb Error]', err.message);
          reject(new Error(`Thumbnail generation failed: ${err.message}\nLogs: ${thumbStderr}`));
        });
    });

    job.status = 'completed';
    job.progress = 100;
    job.message = 'Video created successfully!';
    job.videoUrl = `/outputs/${jobId}.mp4`;
    job.thumbnailUrl = `/outputs/${jobId}.jpg`;

    // Cleanup temp
    fs.rmSync(jobTempDir, { recursive: true, force: true });

  } catch (error: any) {
    throw error;
  }
}
