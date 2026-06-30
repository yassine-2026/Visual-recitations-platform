import axios from 'axios';

const BASE_URL = 'https://api.alquran.cloud/v1';

export const QuranService = {
  async getSurahs() {
    try {
      const response = await axios.get(`${BASE_URL}/surah`, { timeout: 10000 });
      return response.data.data;
    } catch (error: any) {
      console.error('Error fetching surahs:', error.message);
      throw new Error('فشل في تحميل قائمة السور، يرجى المحاولة لاحقاً.');
    }
  },

  async getAyahAudio(surahNumber: number, ayahNumber: number, reciter: string) {
    try {
      const response = await axios.get(`${BASE_URL}/ayah/${surahNumber}:${ayahNumber}/${reciter}`, { timeout: 10000 });
      return response.data.data.audio;
    } catch (error: any) {
      console.error(`Error fetching ayah audio for ${surahNumber}:${ayahNumber}:`, error.message);
      throw new Error(`فشل في جلب تلاوة الآية ${ayahNumber} من السورة ${surahNumber}.`);
    }
  }
};
