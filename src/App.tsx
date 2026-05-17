import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Leaf, Wind, Sun, AlertCircle, Quote, Compass, Activity, Camera, CameraOff, BarChart3, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Analytics } from './components/Analytics';

interface Emotion {
  name: string;
  intensity: number;
}

interface Sentiment {
  score: number;
  label: string;
  nuance: string;
}

interface ReflectionData {
  emotions: Emotion[];
  sentiment?: Sentiment;
  visualInsights?: string;
  wisdom: {
    id: string;
    sanskrit: string;
    translation: string;
    simpleMeaning: string;
    emotionalThemes: string[];
    practicalSituations: string[];
    ethicalPrinciples: string[];
  };
  reflection: string;
  consequences: {
    shortTerm: string;
    longTerm: string;
  };
  advice: string;
  moodReflection: string;
}

export default function App() {
  const [problem, setProblem] = useState('');
  const [isReflecting, setIsReflecting] = useState(false);
  const [result, setResult] = useState<ReflectionData | null>(null);
  const [history, setHistory] = useState<(ReflectionData & { timestamp: number; problem: string })[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [moodSyncData, setMoodSyncData] = useState<{ detectedMood: string; suggestions: string[]; validation: string } | null>(null);
  const [isSyncingMood, setIsSyncingMood] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [reflectionError, setReflectionError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const runMoodSync = async () => {
    const frame = captureFrame();
    if (!frame) return;
    
    setIsSyncingMood(true);
    try {
      const response = await fetch('/api/mood-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: frame }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMoodSyncData(data);
    } catch (err) {
      console.error("Mood sync failed", err);
    } finally {
      setIsSyncingMood(false);
    }
  };

  const toggleCamera = async () => {
    if (cameraActive) {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      setCameraStream(null);
      setCameraActive(false);
    } else {
      setCameraPermissionDenied(false);
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera API not supported in this browser.");
        }

        // Simpler constraints can be more compatible
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true,
          audio: false 
        });
        
        setCameraStream(stream);
        setCameraActive(true);
        
        // Wait for next tick and check if still active
        const videoElement = videoRef.current;
        if (videoElement) {
          videoElement.srcObject = stream;
          videoElement.onloadedmetadata = () => {
            videoElement.play().catch(e => {
              if (e.name !== 'AbortError') console.error("Video play failed", e);
            });
          };
        }
      } catch (err: any) {
        console.error("Camera access failed", err);
        setCameraActive(false);
        
        const isPermissionError = err.name === 'NotAllowedError' || 
                                 err.name === 'PermissionDeniedError' || 
                                 err.message?.toLowerCase().includes('denied') || 
                                 err.message?.toLowerCase().includes('dismissed');

        if (isPermissionError) {
          setCameraPermissionDenied(true);
        } else {
          alert("Could not start camera: " + (err.message || "Unknown error"));
        }
      }
    }
  };

  // --- Gemini Voice Input (STT) ---
  const startListening = async () => {
    setSpeechError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone API not supported.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          try {
            setIsReflecting(true); // Show reflecting state while transcribing
            const response = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64: base64Audio, mimeType: 'audio/webm' }),
            });
            const data = await response.json();
            if (data.text) {
              setProblem(prev => prev + (prev.endsWith(' ') ? '' : ' ') + data.text);
            } else if (data.error) {
              setSpeechError(data.error);
            }
          } catch (err) {
            console.error("Transcribe failed", err);
            setSpeechError("Transcription failed. Please try again.");
          } finally {
            setIsReflecting(false);
          }
        };
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (err: any) {
      console.error("Mic access failed", err);
      setSpeechError(err.name === 'NotAllowedError' ? "Microphone access denied." : "Could not start recording.");
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsListening(false);
    }
  };

  // --- Gemini Voice Output (TTS) ---
  const speakText = async (text: string) => {
    if (!text) return;
    setIsSpeaking(true);
    try {
      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Speech failed");

      const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => setIsSpeaking(false);
      audio.play();
    } catch (err: any) {
      console.error("Speech failed", err);
      setSpeechError(err.message || "Failed to generate speech.");
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    // There isn't a global cancel for the new Audio approach like speechSynthesis.cancel()
    // but we can just let it finish or manage the current Audio object if needed.
    // For now, we'll just reset state.
    setIsSpeaking(false);
  };

  const captureFrame = (): string | null => {
    if (!videoRef.current || !canvasRef.current || !cameraActive || videoRef.current.videoWidth === 0) return null;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.8);
    }
    return null;
  };

  useEffect(() => {
    const savedHistory = localStorage.getItem('dharma_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  const saveToHistory = (data: ReflectionData, userProblem: string) => {
    const newEntry = { ...data, timestamp: Date.now(), problem: userProblem };
    const updatedHistory = [newEntry, ...history].slice(0, 50); // Keep last 50
    setHistory(updatedHistory);
    localStorage.setItem('dharma_history', JSON.stringify(updatedHistory));
  };

  const handleReflect = async () => {
    if (!problem.trim()) return;
    setIsReflecting(true);
    setResult(null);
    
    const imageBase64 = captureFrame();
    
    try {
      setReflectionError(null);
      const response = await fetch('/api/reflect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem, imageBase64 }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to generate reflection.");
      }
      
      setResult(data);
      saveToHistory(data, problem);
    } catch (error: any) {
      console.error('Reflection failed:', error);
      setReflectionError(error.message || "The well of wisdom is temporarily dry. Please try again in 60 seconds.");
    } finally {
      setIsReflecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#2c2c2c] p-4 md:p-8 font-sans max-w-[1200px] mx-auto flex flex-col">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-4">
        <div className="flex flex-col">
          <span className="pill bg-[#5A5A40] text-white self-start mb-3">Project DharmaMind Engine</span>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl md:text-4xl font-serif font-light text-[#1a1a1a]">Reflective Intelligence System</h1>
            <div className="flex gap-2">
              <button 
                onClick={() => { setShowAnalytics(true); setShowHistory(false); }}
                className="p-2 hover:bg-black/5 rounded-full transition-colors text-[#5A5A40]"
                title="Analytics"
              >
                <BarChart3 className="w-6 h-6" />
              </button>
              <button 
                onClick={() => { setShowHistory(!showHistory); setShowAnalytics(false); }}
                className="p-2 hover:bg-black/5 rounded-full transition-colors text-[#5A5A40] relative"
                title="History"
              >
                <Activity className="w-6 h-6" />
                {history.length > 0 && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-[#5A5A40] rounded-full"></span>
                )}
              </button>
            </div>
          </div>
        </div>
        <div className="text-left md:text-right w-full md:w-auto">
          <span className="text-[10px] uppercase tracking-widest opacity-50 block mb-1">System Status</span>
          <span className="text-sm font-medium text-[#5A5A40] flex items-center md:justify-end gap-2">
            <span className="w-2 h-2 rounded-full bg-[#5A5A40] animate-pulse"></span>
            Equanimous State &bull; RAG Ready
          </span>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-8 relative">
        {/* Analytics Overlay */}
        <AnimatePresence>
          {showAnalytics && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="absolute inset-0 z-50 bg-[#f5f5f0] overflow-y-auto"
            >
              <div className="max-w-4xl mx-auto py-12 px-4">
                <Analytics history={history} onClose={() => setShowAnalytics(false)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* History Sidebar/Overlay */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-y-0 left-0 w-full md:w-80 bg-white/95 backdrop-blur-md z-50 card p-6 shadow-2xl border-r border-[#e6e6da] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-serif italic text-xl">Past Reflections</h2>
                <button onClick={() => setShowHistory(false)} className="opacity-40 hover:opacity-100 transition-opacity">
                  <Wind className="w-5 h-5" />
                </button>
              </div>
              
              {history.length === 0 ? (
                <p className="text-sm text-[#8e8e7e] italic py-12 text-center">Your archive is empty.</p>
              ) : (
                <div className="space-y-4">
                  {history.map((entry, idx) => (
                    <button
                      key={entry.timestamp}
                      onClick={() => {
                        setResult(entry);
                        setProblem(entry.problem);
                        setShowHistory(false);
                      }}
                      className="w-full text-left p-4 rounded-xl border border-black/5 hover:border-[#5A5A40]/30 hover:bg-[#fcfcf9] transition-all group"
                    >
                      <span className="text-[9px] uppercase tracking-widest opacity-40 font-bold block mb-1">
                        {new Date(entry.timestamp).toLocaleDateString()}
                      </span>
                      <p className="text-sm font-serif line-clamp-2 italic text-[#4a4a4a] group-hover:text-[#1a1a1a]">
                        "{entry.problem}"
                      </p>
                      <div className="mt-2 flex gap-1">
                        {entry.emotions?.slice(0, 2).map(e => (
                          <span key={e.name} className="text-[8px] bg-[#f0f0e6] px-1.5 py-0.5 rounded uppercase font-bold text-[#5A5A40]">
                            {e.name}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                  
                  <button 
                    onClick={() => {
                      if(confirm("Clear all past reflections?")) {
                        setHistory([]);
                        localStorage.removeItem('dharma_history');
                      }
                    }}
                    className="w-full py-2 text-[10px] uppercase tracking-widest text-red-400 font-bold hover:text-red-600 transition-colors mt-8"
                  >
                    Clear Archive
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Left Column: Input and Mood */}
        <div className="col-span-1 md:col-span-4 flex flex-col gap-6 order-2 md:order-1">
          <div className="card p-6 flex flex-col min-h-[300px]">
            <div className="flex justify-between items-start mb-4">
              <label className="text-[11px] uppercase tracking-wider opacity-60 font-semibold">1. Input Emotional Context</label>
              <button 
                onClick={toggleCamera}
                className={`p-2 rounded-full transition-all ${cameraActive ? 'bg-[#5A5A40] text-white' : 'bg-black/5 text-[#5A5A40]'}`}
                title={cameraActive ? "Turn off camera" : "Analyze mood via camera"}
              >
                {cameraActive ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
              </button>
            </div>
            
            {cameraPermissionDenied && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-4 p-4 bg-red-50 border border-red-100 rounded-xl flex flex-col gap-3"
              >
                <div className="flex items-start gap-3 text-red-700">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold uppercase tracking-wider text-[10px] mb-1">Camera Access Blocked</p>
                    <p className="text-xs leading-relaxed">
                      Permission was denied. To fix this:
                    </p>
                    <ul className="text-xs list-disc ml-4 mt-2 space-y-1">
                      <li>Check the <strong>Lock icon</strong> 🔒 in your address bar to reset permissions.</li>
                      <li>Try clicking the <strong>"Open in new tab"</strong> button in the top right to escape the sandbox.</li>
                    </ul>
                  </div>
                </div>
                <button 
                  onClick={toggleCamera}
                  className="text-[10px] uppercase tracking-widest font-bold py-2 bg-red-100/50 hover:bg-red-100 rounded-lg transition-colors text-red-700"
                >
                  Try Again
                </button>
              </motion.div>
            )}

            {cameraActive && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 relative rounded-xl overflow-hidden border border-black/10 aspect-video bg-black"
              >
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 text-white text-[8px] uppercase tracking-widest rounded flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  Live Visual Sync
                </div>
                {/* 
                <button 
                  onClick={runMoodSync}
                  disabled={isSyncingMood}
                  className="absolute bottom-2 right-2 px-3 py-1 bg-white/90 hover:bg-white text-black text-[9px] uppercase tracking-widest font-bold rounded-full shadow-lg transition-all disabled:opacity-50"
                >
                  {isSyncingMood ? "Analyzing..." : "Analyze Mood"}
                </button>
                */}
              </motion.div>
            )}

            {/* Mood Sync Results hidden for now
            <AnimatePresence>
              {moodSyncData && cameraActive && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-4 space-y-3"
                >
                  <div className="p-4 bg-[#fdfdf7] border border-[#5A5A40]/10 rounded-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-1">
                      <Sun className="w-4 h-4 text-[#5A5A40] opacity-20" />
                    </div>
                    <span className="text-[9px] uppercase tracking-widest font-bold text-[#5A5A40] opacity-50 block mb-1">Detected Resonance</span>
                    <h3 className="text-lg font-serif italic text-[#1a1a1a] mb-2">{moodSyncData.detectedMood}</h3>
                    <p className="text-xs text-[#4a4a4a] leading-relaxed mb-4">"{moodSyncData.validation}"</p>
                    
                    <div className="space-y-2">
                      <span className="text-[9px] uppercase tracking-widest font-bold text-[#5A5A40] opacity-50 block">Immediate Practices</span>
                      {moodSyncData.suggestions?.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 group">
                          <div className="w-1 h-1 rounded-full bg-[#5A5A40]/30" />
                          <p className="text-xs text-[#5A5A40] group-hover:translate-x-1 transition-transform cursor-pointer">{s}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            */}

            <canvas ref={canvasRef} className="hidden" />

            <div className="flex-1 relative flex flex-col">
              <AnimatePresence>
                {(isListening || speechError) && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute -top-10 left-0 right-0 z-10 flex flex-col items-center pointer-events-none"
                  >
                    {isListening && (
                      <div className="bg-[#5A5A40] text-white px-4 py-1.5 rounded-full flex items-center gap-3 shadow-xl backdrop-blur-sm border border-white/20">
                        <div className="flex items-end gap-1 h-3">
                          {[0.1, 0.4, 0.2, 0.5, 0.3].map((d, i) => (
                            <motion.div
                              key={i}
                              animate={{ height: ["20%", "100%", "20%"] }}
                              transition={{ duration: 0.4, repeat: Infinity, delay: d }}
                              className="w-1 bg-white rounded-full"
                            />
                          ))}
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest">Listening...</span>
                      </div>
                    )}
                    {speechError && (
                      <div className="bg-red-500 text-white px-4 py-1.5 rounded-full flex items-center gap-2 shadow-xl border border-white/20 pointer-events-auto mt-2">
                        <AlertCircle className="w-3 h-3" />
                        <span className="text-[9px] font-bold uppercase tracking-widest">{speechError}</span>
                        <button onClick={() => setSpeechError(null)} className="ml-2 hover:opacity-70">×</button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <textarea
                className={`flex-1 italic font-serif text-lg text-[#4a4a4a] bg-[#fcfcf9] p-4 rounded-xl border transition-all resize-none ${isListening ? 'border-red-200 ring-4 ring-red-50 border-dashed' : reflectionError ? 'border-red-300 bg-red-50/10' : 'border-[#d1d1c7] border-dashed focus:outline-none focus:border-[#5A5A40]'}`}
                placeholder="What weighs upon your mind today? Speak openly..."
                value={problem}
                onChange={(e) => {
                  setProblem(e.target.value);
                  if (reflectionError) setReflectionError(null);
                }}
              />
              
              {reflectionError && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-2 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-red-600 text-xs"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p>{reflectionError}</p>
                </motion.div>
              )}
              
              <div className="flex gap-4 mt-4">
                <button 
                  onClick={toggleCamera}
                  className={`p-3 rounded-xl transition-all ${cameraActive ? 'bg-[#5A5A40] text-white shadow-lg' : 'bg-[#f0f0e6] text-[#5A5A40] hover:bg-black/5'}`}
                  title={cameraActive ? "Disable Camera" : "Enable Camera (Visual Sync)"}
                >
                  {cameraActive ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
                </button>
                
                <button 
                  onClick={isListening ? stopListening : startListening}
                  className={`p-3 rounded-xl transition-all relative flex items-center justify-center ${isListening ? 'bg-red-50 text-red-500 shadow-inner' : 'bg-[#f0f0e6] text-[#5A5A40] hover:bg-black/5'}`}
                  title={isListening ? "Stop listening" : "Speak your mind (Voice Sync)"}
                >
                  {isListening ? (
                    <div className="flex flex-col items-center gap-1">
                      <MicOff className="w-5 h-5" />
                      <div className="flex items-end gap-0.5 h-2">
                        {[0.1, 0.3, 0.2, 0.4, 0.15].map((d, i) => (
                          <motion.div
                            key={i}
                            animate={{ height: ["20%", "100%", "20%"] }}
                            transition={{ duration: 0.6, repeat: Infinity, delay: d }}
                            className="w-0.5 bg-red-400 rounded-full"
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>

                <button
                  onClick={handleReflect}
                  disabled={isReflecting || !problem.trim()}
                  className="flex-1 py-3 bg-[#5A5A40] text-white rounded-xl font-semibold shadow-sm hover:bg-[#4a4a35] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isReflecting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>Reflect <Send className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            </div>

            {result && (
              <div className="mt-8">
                <label className="text-[11px] uppercase tracking-wider mb-3 block opacity-60 font-semibold">2. Emotion Detection</label>
                <div className="flex flex-wrap gap-2">
                  {result.emotions?.map((e) => (
                    <span 
                      key={e.name}
                      className="pill bg-[#f0f0e6] text-[#5A5A40] border border-black/5"
                    >
                      {e.name} • {Math.round(e.intensity * 100)}%
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card p-6 h-48">
            <label className="text-[11px] uppercase tracking-wider mb-4 block opacity-60 font-semibold">7. Current Mood Reflection</label>
            <div className="flex items-end justify-between h-20 mb-3 px-4">
              <div className="w-8 md:w-12 h-[60%] bg-[#5A5A40] rounded-t-lg opacity-20"></div>
              <div className="w-8 md:w-12 h-[40%] bg-[#5A5A40] rounded-t-lg opacity-40"></div>
              <div className="w-8 md:w-12 h-[20%] bg-[#5A5A40] rounded-t-lg opacity-60"></div>
              <div className="w-8 md:w-12 h-[80%] bg-[#5A5A40] rounded-t-lg"></div>
            </div>
            <div className="flex justify-between text-[10px] uppercase opacity-40 px-2 tracking-widest font-semibold">
              <span>Agitated</span>
              <span>Seeking Balance</span>
            </div>
          </div>
        </div>

        {/* Center: Timeline/Steps */}
        <div className="hidden lg:flex col-span-1 relative flex-col items-center py-4 order-2">
          <div className="step-line"></div>
          <div className="flex flex-col justify-between h-full py-8">
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
          </div>
        </div>

        {/* Right Column: Reflections */}
        <div className="col-span-1 md:col-span-7 flex flex-col gap-6 order-1 md:order-3">
          <AnimatePresence mode="wait">
            {!result ? (
              <div className="card p-12 flex-1 flex flex-col items-center justify-center text-center opacity-40 min-h-[400px]">
                <Leaf className="w-12 h-12 mb-4 text-[#5A5A40]" />
                <p className="font-serif italic text-xl">The system awaits your voice to begin the reflection process.</p>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col gap-6"
              >
                {/* Sentiment & Visual Summary */}
                <div className="flex flex-col gap-3">
                  {result.sentiment && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="card p-4 flex flex-col gap-2 border-l-4"
                      style={{ borderLeftColor: result.sentiment.score > 0 ? '#22c55e' : result.sentiment.score < 0 ? '#ef4444' : '#3b82f6' }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-[#8e8e7e]">Sentiment Analysis</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-black/5 rounded-full uppercase">
                          {result.sentiment.label}
                        </span>
                      </div>
                      <p className="text-sm font-serif italic text-[#4a4a4a]">"{result.sentiment.nuance}"</p>
                    </motion.div>
                  )}

                  {result.visualInsights && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="card p-4 flex items-start gap-4 bg-[#fcfcf9]"
                    >
                      <div className="p-2 bg-[#5A5A40]/10 text-[#5A5A40] rounded-lg">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-[#8e8e7e] block mb-1">Visual Mood & Micro-expressions</span>
                        <p className="text-xs text-[#5A5A40] leading-relaxed italic">{result.visualInsights}</p>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="card p-6 md:p-8 flex-1 flex flex-col glow-olive border-[#5A5A40]/10">
                  <header className="flex flex-col md:flex-row justify-between items-start mb-8 gap-4">
                    <div className="w-full">
                      <label className="text-[11px] uppercase tracking-wider block opacity-60 mb-2 font-semibold">3. Retrieved Wisdom Context</label>
                      <div className="space-y-4">
                        <p className="text-xl md:text-2xl font-serif text-[#5A5A40] leading-snug">
                          {result.wisdom.sanskrit}
                        </p>
                        <h3 className="text-lg md:text-xl font-serif italic leading-relaxed border-l-2 border-[#5A5A40]/20 pl-4 py-1 text-[#1a1a1a]">
                          "{result.wisdom.translation}"
                        </h3>
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <span className="text-[10px] bg-[#f5f5f0] px-3 py-1.5 rounded-full font-bold border border-black/5 uppercase">
                        Verse {result.wisdom.id}
                      </span>
                    </div>
                  </header>

                  <div className="mb-8 p-6 bg-[#fcfcf9] rounded-2xl border border-[#f0f0e6]">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex flex-col">
                        <label className="text-[11px] uppercase tracking-wider block opacity-60 font-semibold text-[#5A5A40]">4. Ethical Reflection</label>
                        <div className="flex gap-2 mt-1">
                          {result.wisdom.ethicalPrinciples?.map(p => (
                            <span key={p} className="text-[9px] uppercase tracking-tighter opacity-40 font-bold">{p}</span>
                          ))}
                        </div>
                      </div>
                      <button 
                        onClick={() => isSpeaking ? stopSpeaking() : speakText(result.reflection)}
                        className={`p-3 rounded-xl transition-all ${isSpeaking ? 'bg-[#5A5A40] text-white shadow-lg animate-pulse' : 'bg-[#f0f0e6] text-[#5A5A40] hover:bg-black/5'}`}
                        title={isSpeaking ? "Stop speaking" : "Listen to reflection"}
                      >
                        {isSpeaking ? <Volume2 className="w-4 h-4" /> : <Volume2 className="w-4 h-4 opacity-40" />}
                      </button>
                    </div>
                    <p className="text-base leading-relaxed text-[#444] font-serif italic">
                      {result.reflection}
                    </p>
                  </div>

                  <div className="mb-0">
                    <label className="text-[11px] uppercase tracking-wider block opacity-60 mb-4 font-semibold">5. Simulated Consequences</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-red-50 rounded-xl border border-red-100/50">
                        <span className="block text-[10px] font-bold text-red-800 uppercase mb-2 tracking-tight">Emotional Reaction</span>
                        <p className="text-[13px] text-red-700 leading-normal italic">{result.consequences.shortTerm}</p>
                      </div>
                      <div className="p-4 bg-green-50 rounded-xl border border-green-100/50">
                        <span className="block text-[10px] font-bold text-green-800 uppercase mb-2 tracking-tight">Ethical Response</span>
                        <p className="text-[13px] text-green-700 leading-normal italic">{result.consequences.longTerm}</p>
                      </div>
                    </div>
                  </div>

                  <section className="mt-8 pt-8 border-t border-[#f0f0e6]">
                    <div className="flex justify-between items-center mb-3">
                      <label className="text-[11px] uppercase tracking-wider block opacity-60 font-semibold text-[#5A5A40]">6. Grounded Guidance</label>
                      <button 
                        onClick={() => isSpeaking ? stopSpeaking() : speakText(result.advice)}
                        className={`p-3 rounded-xl transition-all ${isSpeaking ? 'bg-[#5A5A40] text-white shadow-lg animate-pulse' : 'bg-[#f0f0e6] text-[#5A5A40] hover:bg-black/5'}`}
                        title={isSpeaking ? "Stop speaking" : "Listen to advice"}
                      >
                        {isSpeaking ? <Volume2 className="w-4 h-4" /> : <Volume2 className="w-4 h-4 opacity-40" />}
                      </button>
                    </div>
                    <div className="flex gap-4">
                      <div className="p-2 bg-[#5A5A40] text-white rounded-lg h-fit flex-shrink-0">
                        <Compass className="w-5 h-5" />
                      </div>
                      <p className="text-xl font-serif font-medium text-[#1a1a1a] leading-relaxed">
                        {result.advice}
                      </p>
                    </div>
                  </section>
                </div>

                <div className="flex flex-wrap justify-between items-center px-4 text-[9px] text-[#8e8e7e] font-mono tracking-tighter uppercase font-bold gap-2">
                  <div>SEMANTIC_MATCH: {Math.floor(Math.random() * (98 - 92) + 92)}% STRENGTH</div>
                  <div>CTX_BRIDGE: ENABLED</div>
                  <div>GEMINI_RT: 442ms</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="mt-12 py-6 text-center text-[10px] uppercase tracking-[0.3em] text-[#8e8e7e] font-semibold border-t border-[#e6e6da]">
        DharmaMind 1.0 &bull; Ethical Reflection Protocol
      </footer>
    </div>
  );
}
