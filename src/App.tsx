import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion } from 'motion/react';
import { Download, Film, Moon, Play, Sun, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { QuranService } from './services/quranService';

interface Surah {
  number: number;
  name: string;
  numberOfAyahs: number;
}

const RECITERS = [
  { id: 'ar.alafasy', name: 'مشاري راشد العفاسي' },
  { id: 'ar.abdulbasitmurattal', name: 'عبد الباسط عبد الصمد (مرتل)' },
  { id: 'ar.mahermuaiqly', name: 'ماهر المعيقلي' },
  { id: 'ar.abdurrahmaansudais', name: 'عبد الرحمن السديس' },
  { id: 'ar.husary', name: 'محمود خليل الحصري' },
  { id: 'ar.minshawi', name: 'محمد صديق المنشاوي' },
];

const RESOLUTIONS = [
  { label: '720p', value: 720 },
  { label: '1080p', value: 1080 },
  { label: '1440p (2K)', value: 1440 },
  { label: '2160p (4K)', value: 2160 },
];

const BG_TYPES = [
  { label: 'طبيعة', value: 'nature landscape' },
  { label: 'مساجد', value: 'mosque architecture islamic' },
  { label: 'سماء', value: 'sky clouds' },
  { label: 'أمطار', value: 'rain water' },
  { label: 'جبال', value: 'mountains landscape' },
  { label: 'بحر', value: 'sea ocean waves' },
  { label: 'صحراء', value: 'desert sand dunes' },
  { label: 'غروب الشمس', value: 'sunset sky' },
  { label: 'ليل ونجوم', value: 'night stars' },
  { label: 'مجرة', value: 'galaxy space' },
];

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [surahs, setSurahs] = useState<Surah[]>([]);
  
  // Form State
  const [surah, setSurah] = useState<number>(1);
  const [startAyah, setStartAyah] = useState<number>(1);
  const [endAyah, setEndAyah] = useState<number>(7);
  const [reciter, setReciter] = useState<string>(RECITERS[0].id);
  const [bgType, setBgType] = useState<string>(BG_TYPES[0].value);
  const [resolution, setResolution] = useState<number>(720);

  // Job State
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    QuranService.getSurahs()
      .then(data => setSurahs(data))
      .catch(err => setError(err.message));
  }, []);

  const selectedSurahInfo = surahs.find(s => s.number === surah);
  const maxAyahs = selectedSurahInfo?.numberOfAyahs || 1;

  useEffect(() => {
    // Reset ayahs if surah changes
    setStartAyah(1);
    setEndAyah(maxAyahs > 5 ? 5 : maxAyahs); // Default to first 5 ayahs
  }, [surah, maxAyahs]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (jobId && jobStatus?.status !== 'completed' && jobStatus?.status !== 'failed') {
      interval = setInterval(() => {
        axios.get(`/api/status/${jobId}`).then(res => {
          setJobStatus(res.data);
          if (res.data.status === 'failed') {
            setError(res.data.message);
          }
        }).catch(err => {
          console.error(err);
        });
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [jobId, jobStatus?.status]);

  const handleGenerate = async () => {
    if (startAyah > endAyah) {
      setError("آية البداية يجب أن تكون قبل آية النهاية.");
      return;
    }
    if (endAyah - startAyah > 50) {
      setError("الرجاء اختيار 50 آية كحد أقصى لتجنب إطالة وقت المعالجة.");
      return;
    }

    setError(null);
    setJobId(null);
    setJobStatus(null);

    try {
      const res = await axios.post('/api/generate', {
        surahNumber: surah,
        startAyah,
        endAyah,
        reciter,
        bgType,
        resolutionHeight: resolution
      });
      setJobId(res.data.id);
      setJobStatus(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 transition-colors duration-300 font-sans">
      
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Film className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-amber-600 to-amber-400 bg-clip-text text-transparent">
              منصة التلاوات المرئية
            </h1>
          </div>
          
          <button 
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          
          {/* Form Column */}
          <div className="lg:col-span-5 space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none"
            >
              <h2 className="text-2xl font-bold mb-6 text-slate-800 dark:text-slate-100">إعدادات الفيديو</h2>
              
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">السورة</label>
                  <select 
                    value={surah} 
                    onChange={e => setSurah(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                  >
                    {surahs.map(s => (
                      <option key={s.number} value={s.number}>{s.number}. {s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">من الآية</label>
                    <select 
                      value={startAyah} 
                      onChange={e => setStartAyah(Number(e.target.value))}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                    >
                      {Array.from({length: maxAyahs}, (_, i) => i + 1).map(num => (
                        <option key={`start-${num}`} value={num}>{num}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">إلى الآية</label>
                    <select 
                      value={endAyah} 
                      onChange={e => setEndAyah(Number(e.target.value))}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                    >
                      {Array.from({length: maxAyahs}, (_, i) => i + 1).filter(n => n >= startAyah).map(num => (
                        <option key={`end-${num}`} value={num}>{num}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">القارئ</label>
                  <select 
                    value={reciter} 
                    onChange={e => setReciter(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                  >
                    {RECITERS.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">الخلفية</label>
                  <select 
                    value={bgType} 
                    onChange={e => setBgType(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                  >
                    {BG_TYPES.map(b => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">جودة الفيديو</label>
                  <select 
                    value={resolution} 
                    onChange={e => setResolution(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                  >
                    {RESOLUTIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={jobStatus?.status === 'pending' || jobStatus?.status === 'processing'}
                  className="w-full mt-6 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl py-4 font-semibold text-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/25"
                >
                  {(jobStatus?.status === 'pending' || jobStatus?.status === 'processing') ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Play className="w-6 h-6" />
                  )}
                  <span>إنشاء الفيديو</span>
                </button>

              </div>
            </motion.div>
          </div>

          {/* Result / Status Column */}
          <div className="lg:col-span-7">
            <div className="h-full min-h-[400px] bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-center relative overflow-hidden">
              
              {!jobStatus && !error && (
                <div className="text-center text-slate-400 dark:text-slate-500 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                    <Film className="w-10 h-10" />
                  </div>
                  <p className="text-lg">قم بإعداد الخيارات واضغط على إنشاء الفيديو</p>
                </div>
              )}

              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-2xl p-6 w-full max-w-md text-center"
                >
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">حدث خطأ</h3>
                  <p className="text-red-600 dark:text-red-300">{error}</p>
                </motion.div>
              )}

              {(jobStatus?.status === 'pending' || jobStatus?.status === 'processing') && (
                <div className="w-full max-w-md space-y-6 text-center">
                  <div className="relative w-32 h-32 mx-auto">
                    <svg className="animate-spin w-full h-full text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold text-slate-700 dark:text-slate-200">{jobStatus.progress}%</span>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-xl font-medium text-slate-800 dark:text-slate-100 mb-2">جاري المعالجة...</h3>
                    <p className="text-slate-500 dark:text-slate-400">{jobStatus.message}</p>
                  </div>

                  <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 mt-4 overflow-hidden">
                    <motion.div 
                      className="bg-gradient-to-r from-amber-600 to-amber-400 h-2 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${jobStatus.progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
              )}

              {jobStatus?.status === 'completed' && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full max-w-2xl text-center space-y-6"
                >
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">تم إنشاء الفيديو بنجاح!</h3>
                  
                  <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl bg-black">
                    <video 
                      controls 
                      className="w-full aspect-video object-contain"
                      poster={jobStatus.thumbnailUrl}
                      src={jobStatus.videoUrl}
                    >
                      متصفحك لا يدعم تشغيل الفيديو.
                    </video>
                  </div>

                  <a 
                    href={`/api/download/${jobStatus.id}`}
                    download
                    className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-amber-500 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:from-amber-500 hover:to-amber-400 transition-all shadow-lg shadow-amber-500/25"
                  >
                    <Download className="w-5 h-5" />
                    تحميل الفيديو
                  </a>
                </motion.div>
              )}

            </div>
          </div>

        </div>
      </main>

    </div>
  );
}
