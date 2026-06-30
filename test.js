import { generateVideo } from './src/server/videoService.js';

async function test() {
  try {
    const job = await generateVideo({
      surahNumber: 1,
      startAyah: 1,
      endAyah: 2,
      reciter: 'ar.alafasy',
      bgType: 'nature landscape',
      resolutionHeight: 720
    });
    console.log(job);
  } catch (err) {
    console.error(err);
  }
}

test();
