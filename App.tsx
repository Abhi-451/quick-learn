
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Chunk, Message, ProcessingStatus, AppMode, Session } from './types';
import { extractTextFromPdf } from './services/pdfService';
import { SimpleRetriever } from './services/ragService';
import { generateAnswer, textToSpeech, decodeAudioData, generateImage } from './services/geminiService';
import { SUBJECT_PLACEHOLDERS, getRandomPlaceholder } from './assets/placeholders';
import { 
  BookOpen, Upload, Send, Volume2, Loader2, FileText, 
  Trash2, Mic, RotateCcw, Square, Play, Sparkles, 
  GraduationCap, Info, ChevronRight, CheckCircle2,
  Command, Search, StopCircle, Plus, History, MessageSquare, Clock, ArrowRight,
  Calendar, Layers, Activity, Filter, MoreVertical, FilePlus, Brain, Zap, Compass,
  ChevronDown, Share2, Settings, User, X, Image as ImageIcon, FileUp, Edit2, Check, Download,
  Sparkle
} from 'lucide-react';

const STORAGE_KEY = 'edumind_sessions_v3';

const App: React.FC = () => {
  // Core State
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  
  // UI & Processing State
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState<ProcessingStatus>({ step: 'idle', progress: 0 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [retriever, setRetriever] = useState<SimpleRetriever | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [showSourceId, setShowSourceId] = useState<string | null>(null);
  const [landingImage] = useState<string>(() => getRandomPlaceholder());
  
  // History Search & Edit State
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Audio playback state
  const [currentAudioSource, setCurrentAudioSource] = useState<AudioBufferSourceNode | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0); 
  const [currentTimeDisplay, setCurrentTimeDisplay] = useState("0:00");
  const [totalTimeDisplay, setTotalTimeDisplay] = useState("0:00");
  const playbackStartTimeRef = useRef<number>(0);
  const playbackOffsetRef = useRef<number>(0);
  const progressIntervalRef = useRef<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed: Session[] = JSON.parse(saved);
        setSessions(parsed);
        if (parsed.length > 0) {
          const mostRecent = [...parsed].sort((a, b) => b.timestamp - a.timestamp)[0];
          loadSession(mostRecent.id, parsed);
        }
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  // Save sessions to localStorage
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } else if (sessions.length === 0 && localStorage.getItem(STORAGE_KEY)) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [sessions]);

  // Sync active session data
  useEffect(() => {
    if (currentSessionId) {
      setSessions(prev => prev.map(s => 
        s.id === currentSessionId 
          ? { ...s, messages, chunks, timestamp: Date.now() } 
          : s
      ));
    }
  }, [messages, chunks, currentSessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) window.clearInterval(progressIntervalRef.current);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const createNewSession = () => {
    stopAudio();
    const newSessionId = Date.now().toString();
    const newSession: Session = {
      id: newSessionId,
      title: 'New Subject',
      messages: [],
      chunks: [],
      timestamp: Date.now(),
      coverImage: getRandomPlaceholder()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSessionId);
    setChunks([]);
    setMessages([]);
    setRetriever(null);
    setInput('');
  };

  const loadSession = (id: string, currentSessionsList?: Session[]) => {
    if (id === currentSessionId) return;
    stopAudio();
    const list = currentSessionsList || sessions;
    const target = list.find(s => s.id === id);
    if (target) {
      setCurrentSessionId(target.id);
      setChunks(target.chunks);
      setMessages(target.messages);
      setRetriever(target.chunks.length > 0 ? new SimpleRetriever(target.chunks) : null);
    }
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    stopAudio();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    if (currentSessionId === id) {
      if (updated.length > 0) {
        loadSession(updated[0].id, updated);
      } else {
        setCurrentSessionId(null);
        setChunks([]);
        setMessages([]);
        setRetriever(null);
      }
    }
  };

  const startEditingSession = (e: React.MouseEvent, s: Session) => {
    e.stopPropagation();
    setEditingSessionId(s.id);
    setEditingTitle(s.title);
  };

  const saveSessionTitle = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingSessionId) return;
    setSessions(prev => prev.map(s => 
      s.id === editingSessionId ? { ...s, title: editingTitle || 'Untitled' } : s
    ));
    setEditingSessionId(null);
  };

  const regenerateSessionImage = async () => {
    if (!currentSessionId || isRegeneratingImage) return;
    const session = sessions.find(s => s.id === currentSessionId);
    if (!session) return;
    
    setIsRegeneratingImage(true);
    try {
      const img = await generateImage(session.title);
      if (img) {
        setSessions(prev => prev.map(s => 
          s.id === currentSessionId ? { ...s, coverImage: img } : s
        ));
      }
    } catch (error) {
      console.error("Regeneration failed", error);
    } finally {
      setIsRegeneratingImage(false);
    }
  };

  const exportToMarkdown = () => {
    const session = sessions.find(s => s.id === currentSessionId);
    if (!session || messages.length === 0) return;

    let md = `# EduMind Session: ${session.title}\n`;
    md += `Date: ${new Date(session.timestamp).toLocaleString()}\n\n`;
    md += `## Discussion\n\n`;

    messages.forEach(msg => {
      const role = msg.role === 'user' ? '### User' : '### AI Tutor';
      md += `${role}\n${msg.content}\n\n`;
      if (msg.role === 'assistant' && msg.retrievedChunks && msg.retrievedChunks.length > 0) {
        md += `*Sources: ${Array.from(new Set(msg.retrievedChunks.map(c => c.fileName))).join(', ')}*\n\n`;
      }
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edumind_${session.title.replace(/\s+/g, '_').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAllHistory = () => {
    if (window.confirm("Are you sure you want to delete all learning sessions? This cannot be undone.")) {
      stopAudio();
      setSessions([]);
      setCurrentSessionId(null);
      setChunks([]);
      setMessages([]);
      setRetriever(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let activeSessionId = currentSessionId;
    const subjectTitle = files[0].name.replace('.pdf', '');
    
    if (!activeSessionId) {
      activeSessionId = Date.now().toString();
      const newSession: Session = {
        id: activeSessionId,
        title: subjectTitle,
        messages: [],
        chunks: [],
        timestamp: Date.now(),
        coverImage: getRandomPlaceholder()
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(activeSessionId);
    }

    setIsProcessing({ step: 'extracting', progress: 0 });
    const allChunks: Chunk[] = [];

    try {
      const extractionPromises = (Array.from(files) as File[]).map(file => extractTextFromPdf(file));
      const results = await Promise.all(extractionPromises);
      results.forEach(res => allChunks.push(...res));

      const updatedChunks = [...chunks, ...allChunks];
      setChunks(updatedChunks);
      const newRetriever = new SimpleRetriever(updatedChunks);
      setRetriever(newRetriever);
      setIsProcessing({ step: 'ready', progress: 100 });
      
      setSessions(prev => prev.map(s => 
        s.id === activeSessionId && (s.title === 'New Subject' || s.title === '')
          ? { ...s, title: subjectTitle } 
          : s
      ));

      generateImage(subjectTitle).then(img => {
        if (img) {
          setSessions(prev => prev.map(s => 
            s.id === activeSessionId ? { ...s, coverImage: img } : s
          ));
        }
      });

      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Knowledge vault updated with **${files.length} material(s)**. I have synthesized the context and am ready to accelerate your learning.`,
          timestamp: Date.now()
        }
      ]);
    } catch (error) {
      console.error("Upload error:", error);
      setIsProcessing({ step: 'idle', progress: 0 });
    } finally {
        if (event.target) event.target.value = '';
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const handleSend = async (mode: AppMode = AppMode.QA) => {
    if (!input.trim() || !retriever || isGenerating) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    
    if (messages.length <= 1 && chunks.length > 0) {
        setSessions(prev => prev.map(s => 
            s.id === currentSessionId && (s.title === 'New Subject' || s.title === '')
                ? { ...s, title: input.length > 40 ? input.substring(0, 40) + '...' : input } 
                : s
        ));
    }

    const currentInput = input;
    setInput('');
    setIsGenerating(true);

    const relevantChunks = retriever.retrieve(currentInput, 12);
    const contextText = relevantChunks.map(c => `[Source: ${c.fileName}, Page: ${c.pageNumber}] ${c.text}`).join('\n\n');

    const answer = await generateAnswer(currentInput, contextText, mode === AppMode.TOPIC_EXPLANATION ? 'EXPLAIN' : 'QA');

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: answer,
      timestamp: Date.now(),
      retrievedChunks: relevantChunks
    };

    setMessages(prev => [...prev, assistantMessage]);
    setIsGenerating(false);
  };

  const stopAudio = () => {
    if (currentAudioSource) {
      try { currentAudioSource.stop(); } catch(e) {}
      setCurrentAudioSource(null);
    }
    if (progressIntervalRef.current) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setPlayingMessageId(null);
    setPlaybackProgress(0);
    setCurrentTimeDisplay("0:00");
    playbackOffsetRef.current = 0;
  };

  const startProgressTracking = (buffer: AudioBuffer, startOffset: number) => {
    if (progressIntervalRef.current) window.clearInterval(progressIntervalRef.current);
    
    setTotalTimeDisplay(formatTime(buffer.duration));

    progressIntervalRef.current = window.setInterval(() => {
      if (!audioContext) return;
      const elapsed = audioContext.currentTime - playbackStartTimeRef.current;
      const currentPos = startOffset + elapsed;
      const progress = (currentPos / buffer.duration) * 100;
      
      setPlaybackProgress(Math.min(100, progress));
      setCurrentTimeDisplay(formatTime(Math.min(buffer.duration, currentPos)));
      
      if (currentPos >= buffer.duration) {
        stopAudio();
      }
    }, 100);
  };

  const playFromOffset = (buffer: AudioBuffer, offset: number, messageId: string) => {
    if (!audioContext) return;
    if (currentAudioSource) {
      try { currentAudioSource.stop(); } catch(e) {}
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    
    source.onended = () => {
      if (playingMessageId === messageId && !currentAudioSource) {
        stopAudio();
      }
    };

    source.start(0, offset);
    setCurrentAudioSource(source);
    setPlayingMessageId(messageId);
    playbackStartTimeRef.current = audioContext.currentTime;
    playbackOffsetRef.current = offset;
    
    startProgressTracking(buffer, offset);
  };

  const handleSeekBack = (messageId: string) => {
    if (!audioContext || playingMessageId !== messageId || !currentAudioSource) return;

    const message = messages.find(m => m.id === messageId);
    if (!message || !message.audioBuffer) return;

    const elapsed = audioContext.currentTime - playbackStartTimeRef.current;
    const currentPos = playbackOffsetRef.current + elapsed;
    const newOffset = Math.max(0, currentPos - 10);
    
    playFromOffset(message.audioBuffer, newOffset, messageId);
  };

  const handlePlayAudio = async (message: Message) => {
    if (playingMessageId === message.id) {
      stopAudio();
      return;
    }

    let ctx = audioContext;
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      setAudioContext(ctx);
    }

    if (message.audioBuffer) {
      playFromOffset(message.audioBuffer, 0, message.id);
      return;
    }

    setPlayingMessageId(message.id);
    const audioBytes = await textToSpeech(message.content);
    
    if (audioBytes && ctx) {
      const buffer = await decodeAudioData(audioBytes, ctx);
      setMessages(prev => prev.map(m => m.id === message.id ? { ...m, audioBuffer: buffer } : m));
      playFromOffset(buffer, 0, message.id);
    } else {
      setPlayingMessageId(null);
    }
  };

  const filteredHistory = useMemo(() => {
    return sessions
      .filter(s => s.title.toLowerCase().includes(historySearchTerm.toLowerCase()))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [sessions, historySearchTerm]);

  const activeCover = sessions.find(s => s.id === currentSessionId)?.coverImage || landingImage;
  const activeSessionTitle = sessions.find(s => s.id === currentSessionId)?.title || "Untitled Session";
  const activeDocCount = useMemo(() => new Set(chunks.map(c => c.fileName)).size, [chunks]);

  return (
    <div className="flex flex-col h-screen bg-[#FDFDFF] text-slate-900 font-sans selection:bg-indigo-100 overflow-hidden">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        className="hidden" 
        multiple 
        accept=".pdf" 
      />
      
      {/* Dynamic Navigation Bar */}
      <header className="bg-white/80 backdrop-blur-2xl border-b border-slate-100/50 px-8 py-4 flex items-center justify-between sticky top-0 z-30 shadow-[0_4px_30px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-5">
          <div className="relative group cursor-pointer" onClick={() => { setCurrentSessionId(null); setChunks([]); setMessages([]); setRetriever(null); }}>
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative bg-white p-2.5 rounded-xl shadow-md flex items-center justify-center">
              <Brain className="text-indigo-600 w-6 h-6 animate-pulse" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              EduMind <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">Nexus</span>
            </h1>
            <div className="flex items-center gap-2">
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Grounded AI Analysis</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {currentSessionId && messages.length > 0 && (
            <button 
              onClick={exportToMarkdown}
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 border border-indigo-100 rounded-full hover:bg-indigo-50 transition-all text-[10px] font-black uppercase tracking-widest"
              title="Export Session"
            >
              <Download size={14} />
              Export MD
            </button>
          )}
          
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-full border border-slate-100 mr-2">
             <Layers className="w-3.5 h-3.5 text-slate-400" />
             <span className="text-[10px] font-bold text-slate-500 uppercase">{sessions.length} Saved Sessions</span>
          </div>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="group flex items-center gap-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 shadow-sm"
            title="Add Resources"
          >
            <Upload size={14} className="group-hover:animate-bounce" />
            <span className="hidden sm:inline">Add Context</span>
          </button>

          <button 
            onClick={createNewSession}
            className="group flex items-center gap-2 bg-slate-900 text-white hover:bg-indigo-600 transition-all px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-slate-200 active:scale-95"
          >
            <Plus size={14} className="group-hover:rotate-90 transition-transform duration-300" />
            <span className="hidden sm:inline">New Session</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Futuristic Sidebar */}
        <aside className="w-96 border-r border-slate-100/60 bg-white/50 backdrop-blur-lg p-6 flex flex-col gap-8 hidden lg:flex relative z-20">
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Active Documents</h2>
              <Zap size={14} className="text-indigo-400" />
            </div>
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full relative group overflow-hidden bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-[2rem] p-5 flex items-center gap-4 hover:shadow-2xl hover:shadow-indigo-100/50 hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="bg-indigo-600 text-white p-3 rounded-2xl shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform duration-300">
                <Upload size={20} />
              </div>
              <div className="text-left">
                <p className="text-xs font-black text-slate-800 uppercase tracking-tight">Expand Context</p>
                <p className="text-[10px] text-slate-500 font-medium">Inject PDF Material</p>
              </div>
            </button>

            <div className="max-h-40 overflow-y-auto custom-scrollbar pr-2 space-y-2.5">
                {chunks.length > 0 ? (
                    Array.from(new Set(chunks.map(c => c.fileName))).map(name => (
                        <div key={name} className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-indigo-200 transition-all group">
                            <div className="bg-slate-50 p-1.5 rounded-lg group-hover:bg-indigo-50 transition-colors">
                              <FileText className="text-indigo-500 w-4 h-4" />
                            </div>
                            <span className="text-[11px] font-bold text-slate-700 truncate flex-1">{name}</span>
                        </div>
                    ))
                ) : (
                  <div className="text-center py-6 px-4 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">No Active Grounding</p>
                  </div>
                )}
            </div>
          </section>

          <section className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-2 mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Session Vault</h2>
              </div>
              <button onClick={clearAllHistory} className="text-[9px] font-black text-rose-400 uppercase tracking-widest hover:text-rose-600 transition-colors">Wipe All</button>
            </div>

            {/* History Search */}
            <div className="relative mb-6 group">
              <input 
                type="text"
                value={historySearchTerm}
                onChange={(e) => setHistorySearchTerm(e.target.value)}
                placeholder="Search history..."
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-10 py-3 text-[11px] font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all group-hover:bg-white"
              />
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-hover:text-indigo-400 transition-colors" />
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
              {filteredHistory.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <History size={20} className="text-slate-200" />
                  </div>
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">No Sessions Found</p>
                </div>
              ) : (
                filteredHistory.map(s => (
                  <div 
                    key={s.id}
                    onClick={() => loadSession(s.id)}
                    className={`group relative p-3 rounded-3xl border transition-all duration-300 cursor-pointer overflow-hidden ${
                      currentSessionId === s.id 
                        ? 'bg-gradient-to-br from-indigo-50 to-white border-indigo-200 shadow-xl shadow-indigo-50/50' 
                        : 'bg-white border-slate-50 hover:bg-slate-50/80 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-sm flex-shrink-0">
                         <img src={s.coverImage || getRandomPlaceholder()} alt="cover" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                         <div className="absolute inset-0 bg-black/10"></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        {editingSessionId === s.id ? (
                          <form onSubmit={saveSessionTitle} className="flex items-center gap-1">
                            <input 
                              autoFocus
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onBlur={() => saveSessionTitle()}
                              className="w-full bg-white border border-indigo-300 rounded px-1.5 py-0.5 text-xs font-black"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button type="submit" className="text-indigo-600"><Check size={14} /></button>
                          </form>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs font-black truncate uppercase tracking-tight ${currentSessionId === s.id ? 'text-indigo-950' : 'text-slate-700'}`}>
                              {s.title}
                            </p>
                          </div>
                        )}
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 flex items-center gap-1.5">
                          <Clock size={10} />
                          {getRelativeTime(s.timestamp)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => startEditingSession(e, s)}
                          className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button 
                          onClick={(e) => deleteSession(e, s.id)}
                          className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>

        {/* Content Canvas */}
        <section className="flex-1 flex flex-col relative bg-[#F8FAFC] lg:rounded-tl-[3.5rem] lg:shadow-[-20px_0_60px_rgba(0,0,0,0.02)] lg:ml-[-1.5rem] lg:z-10 border-l border-slate-100/50">
          <div className="flex-1 overflow-y-auto p-12 space-y-8 custom-scrollbar scroll-smooth">
            
            {/* Knowledge Discovery Dashboard (Landing) */}
            {chunks.length === 0 && !currentSessionId ? (
                <div className="h-full flex flex-col items-center justify-start max-w-5xl mx-auto space-y-16 py-12">
                   <div className="w-full max-w-3xl relative">
                      <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px]"></div>
                      <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-violet-500/10 rounded-full blur-[100px]"></div>
                      
                      <div className="relative bg-white/60 backdrop-blur-2xl border-2 border-white rounded-[4rem] p-10 text-center shadow-[0_32px_120px_-20px_rgba(0,0,0,0.08)] flex flex-col items-center gap-8 animate-in fade-in slide-in-from-bottom-10 duration-1000">
                        <div className="w-full h-64 rounded-[3rem] overflow-hidden shadow-2xl relative group">
                           <img 
                              src={activeCover} 
                              alt="Educational Hero" 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" 
                           />
                           <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent"></div>
                           <div className="absolute bottom-8 left-0 right-0 flex justify-center">
                              <div className="bg-white/20 backdrop-blur-md px-6 py-2 rounded-full border border-white/30 text-white text-[10px] font-black uppercase tracking-[0.3em]">
                                Visual Insight Engine
                              </div>
                           </div>
                        </div>

                        <div className="space-y-4">
                          <h2 className="text-5xl font-black text-slate-900 tracking-tighter">
                            Elevate your <br/>
                            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent underline decoration-indigo-200 decoration-8 underline-offset-8">Learning.</span>
                          </h2>
                          <p className="text-slate-500 font-medium leading-relaxed max-w-md mx-auto text-lg">
                            Establish your context by uploading materials. Our AI generates a unique visual signature for every learning vault.
                          </p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-4">
                          <button 
                              onClick={() => fileInputRef.current?.click()}
                              className="px-12 py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-xs tracking-[0.2em] shadow-2xl shadow-slate-200 hover:bg-indigo-600 hover:-translate-y-1 transition-all duration-300 flex items-center gap-4 group"
                          >
                              <Upload size={20} className="group-hover:animate-bounce" />
                              Upload Material
                          </button>
                        </div>
                      </div>
                   </div>

                  {/* History Gallery */}
                  {sessions.length > 0 && (
                    <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300">
                      <div className="flex items-center justify-between border-b border-slate-100/60 pb-6 px-4">
                          <div className="flex items-center gap-4">
                              <div className="bg-white p-2 rounded-xl shadow-sm">
                                <History className="text-indigo-500" size={20} />
                              </div>
                              <h4 className="text-sm font-black text-slate-800 uppercase tracking-[0.3em]">Knowledge History</h4>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {[...sessions].sort((a, b) => b.timestamp - a.timestamp).slice(0, 6).map(s => {
                              const docCount = new Set(s.chunks.map(c => c.fileName)).size;
                              const lastMsg = s.messages.length > 0 ? s.messages[s.messages.length - 1].content : "No discussion yet.";
                              return (
                                  <div 
                                      key={s.id}
                                      onClick={() => loadSession(s.id)}
                                      className="group bg-white rounded-[2.5rem] border border-slate-100 hover:border-indigo-400 hover:shadow-[0_20px_60px_-15px_rgba(99,102,241,0.15)] transition-all cursor-pointer flex flex-col relative overflow-hidden h-full"
                                  >
                                      <div className="w-full h-40 overflow-hidden relative">
                                        <img src={s.coverImage || getRandomPlaceholder()} alt="subject" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent"></div>
                                        <div className="absolute top-4 right-4 bg-white/80 backdrop-blur-md p-2 rounded-xl text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <ArrowRight size={20} />
                                        </div>
                                        <div className="absolute bottom-2 left-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">{getRelativeTime(s.timestamp)}</div>
                                      </div>
                                      
                                      <div className="p-8 pt-2 space-y-3 flex-1 flex flex-col">
                                          <h5 className="text-lg font-black text-slate-800 uppercase truncate leading-tight">{s.title || "Untitled Vault"}</h5>
                                          <p className="text-[10px] text-slate-400 font-medium line-clamp-2 leading-relaxed flex-1 italic group-hover:text-slate-600 transition-colors">
                                            "{lastMsg.substring(0, 80)}..."
                                          </p>
                                          <div className="flex items-center gap-4 pt-4 border-t border-slate-50">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                              <Layers size={12} className="text-indigo-400" />
                                              {docCount} Docs
                                            </p>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                              <MessageSquare size={12} className="text-violet-400" />
                                              {s.messages.length} Q&A
                                            </p>
                                          </div>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                    </div>
                  )}
                </div>
            ) : (
              /* Active Session Content */
              <>
                {/* Prominent Session Overview Header */}
                <div className="relative w-full h-80 mb-4 shrink-0 animate-in fade-in slide-in-from-top-4 duration-1000">
                  <div className="absolute inset-0 overflow-hidden rounded-[3.5rem] shadow-2xl border-4 border-white group">
                    <img 
                      src={activeCover} 
                      alt="Session Overview Visual" 
                      className={`w-full h-full object-cover transition-transform duration-[2000ms] group-hover:scale-110 ${isRegeneratingImage ? 'blur-sm scale-110' : ''}`} 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/40 to-transparent"></div>
                  </div>
                  
                  <div className="absolute bottom-10 left-10 right-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Sparkles size={14} className="text-indigo-400 animate-pulse" />
                        <span className="text-[10px] font-black text-white/70 uppercase tracking-[0.4em]">Active Study Session</span>
                      </div>
                      <h2 className="text-5xl font-black text-white uppercase tracking-tighter leading-tight drop-shadow-lg">
                        {activeSessionTitle}
                      </h2>
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="bg-white/10 backdrop-blur-xl px-5 py-2 rounded-full border border-white/20 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-3">
                          <Layers size={14} className="text-indigo-300" /> {activeDocCount} Source Documents
                        </span>
                        <span className="bg-white/10 backdrop-blur-xl px-5 py-2 rounded-full border border-white/20 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-3">
                           <MessageSquare size={14} className="text-violet-300" /> {messages.length} Neural Insights
                        </span>
                        <span className="bg-white/10 backdrop-blur-xl px-5 py-2 rounded-full border border-white/20 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-3">
                           <Clock size={14} className="text-emerald-300" /> {getRelativeTime(sessions.find(s => s.id === currentSessionId)?.timestamp || Date.now())}
                        </span>
                      </div>
                    </div>
                    
                    <button 
                      onClick={regenerateSessionImage}
                      disabled={isRegeneratingImage}
                      className="group bg-white/95 backdrop-blur-xl text-slate-900 px-8 py-4 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-3 hover:bg-indigo-600 hover:text-white transition-all shadow-2xl active:scale-95 disabled:opacity-50 border border-white/50"
                    >
                      {isRegeneratingImage ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Visualizing...
                        </>
                      ) : (
                        <>
                          <ImageIcon size={16} className="group-hover:rotate-12 transition-transform" />
                          Update Visual
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {messages.length === 0 ? (
                  /* Initial state awaiting prompt */
                  <div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-12 py-12 animate-in fade-in duration-700">
                    <div className="space-y-6">
                      <h3 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Vault <span className="text-indigo-600">Established.</span></h3>
                      <p className="text-slate-500 font-medium text-lg leading-relaxed">
                        I am strictly grounded in <span className="text-slate-900 font-black">"{activeSessionTitle}"</span>. All responses will derive solely from your provided contexts.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-6 w-full max-w-lg">
                      {["Executive Summary", "Core Principles", "Critical Definitions", "Practice Exam Prep"].map(tip => (
                        <button 
                          key={tip}
                          onClick={() => setInput(`Give me a ${tip.toLowerCase()} based on the docs.`)}
                          className="p-6 bg-white border border-slate-100 rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 hover:border-indigo-500 hover:bg-indigo-50/50 hover:text-indigo-700 hover:-translate-y-1 transition-all shadow-sm flex items-center justify-between group"
                        >
                          {tip}
                          <Zap size={14} className="text-slate-300 group-hover:text-indigo-500 group-hover:scale-125 transition-all" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Conversation flow */
                  messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-8 duration-700`}>
                      <div className="max-w-[80%] flex flex-col gap-4">
                        <div className={`rounded-[2.5rem] p-8 relative group transition-all duration-500 cursor-default ${
                            msg.role === 'user' 
                              ? 'bg-slate-900 text-white rounded-tr-none shadow-2xl shadow-slate-200 hover:scale-[1.01] hover:shadow-slate-400/40' 
                              : 'bg-white text-slate-800 rounded-tl-none border border-slate-100/60 shadow-xl shadow-slate-100/50 hover:scale-[1.01] hover:shadow-indigo-500/10'
                          }`}>
                          {msg.role === 'assistant' && (
                            <div className="flex items-center justify-between mb-4">
                               <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                                  <Brain size={14} />
                                </div>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Validated Output</span>
                               </div>
                               {msg.retrievedChunks && msg.retrievedChunks.length > 0 && (
                                <button 
                                  onClick={() => setShowSourceId(showSourceId === msg.id ? null : msg.id)}
                                  className="text-[9px] font-black text-indigo-600 uppercase tracking-widest hover:underline flex items-center gap-1"
                                >
                                  <Layers size={10} />
                                  {showSourceId === msg.id ? 'Hide Sources' : `${msg.retrievedChunks.length} Citations`}
                                </button>
                               )}
                            </div>
                          )}
                          <div className="prose prose-slate max-w-none whitespace-pre-wrap leading-relaxed font-medium text-base">
                            {msg.content}
                          </div>

                          {showSourceId === msg.id && msg.retrievedChunks && (
                            <div className="mt-6 pt-6 border-t border-slate-100 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                              <h6 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Grounding Context</h6>
                              <div className="grid grid-cols-1 gap-2">
                                {msg.retrievedChunks.slice(0, 3).map((chunk, idx) => (
                                  <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                                    <div className="p-1.5 bg-white rounded-lg border border-slate-100 text-slate-400">
                                      <FileText size={12} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[10px] font-bold text-slate-700 truncate">{chunk.fileName} • Page {chunk.pageNumber}</p>
                                      <p className="text-[9px] text-slate-400 line-clamp-1 italic mt-0.5">"...{chunk.text.substring(0, 80)}..."</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {msg.role === 'assistant' && (
                          <div className="flex items-center gap-4 pl-4">
                            {playingMessageId === msg.id ? (
                              <div className="flex flex-col gap-3 w-full min-w-[420px]">
                                <div className="flex items-center gap-4 bg-white/90 backdrop-blur-xl rounded-[2.5rem] px-8 py-6 border border-indigo-100 shadow-[0_30px_60px_-15px_rgba(99,102,241,0.2)] animate-in slide-in-from-left-4 duration-500">
                                  {msg.audioBuffer ? (
                                    <>
                                      <div className="flex items-center gap-2">
                                        <button 
                                          onClick={() => handleSeekBack(msg.id)} 
                                          className="flex items-center gap-2 px-5 py-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-2xl transition-all font-black text-[9px] uppercase tracking-widest shadow-sm active:scale-95 group"
                                        >
                                          <RotateCcw size={18} className="group-hover:-rotate-45 transition-transform" />
                                          -10s
                                        </button>
                                        <button 
                                          onClick={stopAudio} 
                                          className="flex items-center gap-2 px-5 py-3 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-2xl transition-all font-black text-[9px] uppercase tracking-widest shadow-sm active:scale-95 group"
                                        >
                                          <Square size={18} className="fill-current" />
                                          Stop
                                        </button>
                                      </div>
                                      
                                      <div className="flex-1 flex flex-col gap-3">
                                        <div className="flex items-center justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                                          <span>{currentTimeDisplay}</span>
                                          <span>{totalTimeDisplay}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden shadow-inner relative">
                                          <div 
                                            className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 h-full transition-all duration-200 ease-linear rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" 
                                            style={{ width: `${playbackProgress}%` }}
                                          ></div>
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex items-center gap-6 py-2 px-4">
                                      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                                      <div className="flex flex-col gap-1">
                                        <span className="text-[10px] font-black text-slate-900 uppercase tracking-[0.3em] animate-pulse">Neural Synthesis</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <button 
                                onClick={() => handlePlayAudio(msg)}
                                className="group flex items-center gap-3 px-8 py-4 bg-white border border-slate-100 rounded-full text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 hover:text-indigo-600 hover:border-indigo-400 hover:shadow-2xl hover:shadow-indigo-50 hover:-translate-y-1 transition-all active:scale-95"
                              >
                                <Play size={16} fill="currentColor" className="group-hover:text-indigo-600 transition-colors" />
                                Listen
                              </button>
                            )}
                            <span className="text-[9px] font-black text-slate-300 uppercase self-center ml-2 tracking-widest">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
            {isGenerating && (
              <div className="flex justify-start">
                <div className="bg-white rounded-[2.5rem] p-8 rounded-tl-none border border-slate-100 shadow-xl flex items-center gap-3">
                    <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce [animation-duration:1s]"></div>
                    <div className="w-3 h-3 bg-violet-500 rounded-full animate-bounce [animation-delay:0.2s] [animation-duration:1s]"></div>
                    <div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s] [animation-duration:1s]"></div>
                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-4">Generating Answer...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-24" />
          </div>

          {/* Fixed Footer Input */}
          <div className="p-10 absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC]/95 to-transparent">
            <div className="max-w-4xl mx-auto">
              <div 
                className={`group relative flex items-end gap-4 bg-white/80 backdrop-blur-3xl border-2 rounded-[3rem] p-5 transition-all duration-500 ease-out shadow-[0_30px_100px_-20px_rgba(0,0,0,0.1)] ${
                  isInputFocused 
                    ? 'border-indigo-500/50 shadow-2xl shadow-indigo-200/40 scale-[1.01] ring-[8px] ring-indigo-500/5 ring-offset-4 ring-offset-transparent' 
                    : 'border-white'
                }`}
              >
                <div className={`absolute left-9 top-1/2 -translate-y-1/2 transition-all duration-500 pointer-events-none ${isInputFocused || input ? 'opacity-0 -translate-x-10' : 'opacity-100'}`}>
                   {chunks.length > 0 ? <Search size={24} className="text-slate-300" /> : <Command size={24} className="text-slate-300" />}
                </div>

                <textarea
                  value={input}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(AppMode.QA);
                    }
                  }}
                  placeholder={
                    chunks.length === 0 
                      ? "Upload materials to begin..." 
                      : "Ask anything grounded in your docs..."
                  }
                  disabled={chunks.length === 0 || isGenerating}
                  className={`flex-1 bg-transparent border-none focus:ring-0 resize-none py-4 pr-6 transition-all duration-500 text-slate-800 placeholder-slate-400 font-bold text-lg max-h-48 custom-scrollbar ${
                    isInputFocused || input ? 'pl-6' : 'pl-16'
                  }`}
                  rows={1}
                />
                
                <div className="flex items-center gap-4 pb-1.5 pr-1.5">
                  <button
                    onClick={() => handleSend(AppMode.TOPIC_EXPLANATION)}
                    disabled={!input.trim() || isGenerating || chunks.length === 0}
                    className="flex items-center gap-3 px-8 py-4 rounded-[1.8rem] text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 bg-emerald-50 hover:bg-emerald-600 hover:text-white disabled:opacity-30 disabled:bg-slate-50 transition-all active:scale-95 group/btn shadow-sm"
                  >
                    <Mic size={18} />
                    <span className="hidden sm:inline">Deep Explain</span>
                  </button>
                  <button
                    onClick={() => handleSend(AppMode.QA)}
                    disabled={!input.trim() || isGenerating || chunks.length === 0}
                    className={`p-5 rounded-[1.8rem] shadow-2xl transition-all duration-500 active:scale-90 transform ${
                      input.trim() 
                        ? 'bg-slate-900 text-white shadow-slate-300' 
                        : 'bg-slate-100 text-slate-300 shadow-none'
                    }`}
                  >
                    <Send size={26} className={input.trim() ? "translate-x-0.5 -rotate-12" : ""} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
