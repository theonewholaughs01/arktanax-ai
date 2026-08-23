import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { choosePreferredVoice } from "@/lib/voice";
import {
  Activity,
  AlertTriangle,
  AudioLines,
  Bot,
  Check,
  ChevronRight,
  Command,
  Cpu,
  LoaderCircle,
  MessageSquarePlus,
  Mic,
  MicOff,
  PanelLeft,
  Plus,
  Send,
  SlidersHorizontal,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  Waves,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type AssistantActivity = "idle" | "listening" | "transcribing" | "thinking" | "speaking" | "error";

type PendingMessage = {
  content: string;
  threadId: number | null;
};

const QUICK_STARTERS = [
  "Help me plan a focused workday.",
  "Turn my rough idea into a clear first draft.",
  "What should I prioritize this week?",
];

const ACTIVITY_COPY: Record<AssistantActivity, { label: string; detail: string }> = {
  idle: { label: "Standing by", detail: "Context is ready" },
  listening: { label: "Listening", detail: "Hold to speak" },
  transcribing: { label: "Transcribing", detail: "Converting your voice" },
  thinking: { label: "Thinking", detail: "Working through context" },
  speaking: { label: "Speaking", detail: "Voice response active" },
  error: { label: "Attention needed", detail: "Try your request again" },
};

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read microphone recording."));
    reader.readAsDataURL(blob);
  });
}

function plainSpeech(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, "Code block omitted.")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function timeLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const utils = trpc.useUtils();
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [composer, setComposer] = useState("");
  const [pendingMessage, setPendingMessage] = useState<PendingMessage | null>(null);
  const [activity, setActivity] = useState<AssistantActivity>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [isVoicePanelOpen, setIsVoicePanelOpen] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const threadsQuery = trpc.assistant.listThreads.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const threadQuery = trpc.assistant.getThread.useQuery(
    { threadId: activeThreadId ?? 1 },
    { enabled: isAuthenticated && activeThreadId !== null },
  );
  const createThreadMutation = trpc.assistant.createThread.useMutation();
  const sendMessageMutation = trpc.assistant.sendMessage.useMutation();
  const deleteThreadMutation = trpc.assistant.deleteThread.useMutation();
  const transcribeMutation = trpc.voice.transcribe.useMutation();

  const threads = threadsQuery.data ?? [];
  const messages = threadQuery.data?.messages ?? [];
  const activeThread = threadQuery.data?.thread;
  const status = ACTIVITY_COPY[activity];
  const speechAvailable = typeof window !== "undefined" && "speechSynthesis" in window;
  const selectedVoice = useMemo(
    () => availableVoices.find(voice => voice.voiceURI === selectedVoiceURI) || choosePreferredVoice(availableVoices),
    [availableVoices, selectedVoiceURI],
  );

  useEffect(() => {
    if (activeThreadId === null && threads.length > 0) {
      setActiveThreadId(threads[0].id);
    }
  }, [activeThreadId, threads]);

  useEffect(() => {
    if (!speechAvailable) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      setSelectedVoiceURI(currentVoiceURI => {
        if (currentVoiceURI && voices.some(voice => voice.voiceURI === currentVoiceURI)) {
          return currentVoiceURI;
        }

        const storedVoiceURI = window.localStorage.getItem("arktanax-voice-uri");
        if (storedVoiceURI && voices.some(voice => voice.voiceURI === storedVoiceURI)) {
          return storedVoiceURI;
        }

        return choosePreferredVoice(voices)?.voiceURI || "";
      });
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [speechAvailable]);

  useEffect(() => {
    if (selectedVoiceURI) window.localStorage.setItem("arktanax-voice-uri", selectedVoiceURI);
  }, [selectedVoiceURI]);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pendingMessage, sendMessageMutation.isPending]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    if (speechAvailable) window.speechSynthesis.cancel();
    if (activity === "speaking") setActivity("idle");
  }, [activity, speechAvailable]);

  const speakText = useCallback(
    (content: string, ignoreMute = false) => {
      if ((!ignoreMute && isMuted) || !speechAvailable) return false;

      const spokenText = plainSpeech(content);
      if (!spokenText) return false;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.rate = 1.02;
      utterance.pitch = 0.92;
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      }
      utterance.onstart = () => setActivity("speaking");
      utterance.onend = () => setActivity("idle");
      utterance.onerror = () => setActivity("idle");
      window.speechSynthesis.speak(utterance);
      return true;
    },
    [isMuted, selectedVoice, speechAvailable],
  );

  const speakReply = useCallback((content: string) => speakText(content), [speakText]);

  const previewVoice = useCallback(() => {
    if (!speechAvailable || !selectedVoice) {
      toast.error("No browser voice is available yet. Chrome may need a moment to load your device voices.");
      return;
    }
    setIsMuted(false);
    const started = speakText("Hello. I am ARKTANAX. Your workspace is ready when you are.", true);
    if (!started) toast.error("ARKTANAX could not start a voice preview in this browser.");
  }, [selectedVoice, speakText, speechAvailable]);

  const sendPrompt = useCallback(
    async (rawPrompt: string) => {
      const content = rawPrompt.trim();
      if (!content || sendMessageMutation.isPending) return;

      stopSpeaking();
      setComposer("");
      setActivity("thinking");
      setPendingMessage({ content, threadId: activeThreadId });

      try {
        const response = await sendMessageMutation.mutateAsync({
          threadId: activeThreadId ?? undefined,
          content,
        });
        setActiveThreadId(response.threadId);
        setPendingMessage(null);
        await Promise.all([
          utils.assistant.listThreads.invalidate(),
          utils.assistant.getThread.invalidate({ threadId: response.threadId }),
        ]);
        if (!speakReply(response.reply)) setActivity("idle");
      } catch (error) {
        console.error(error);
        setPendingMessage(null);
        setComposer(content);
        setActivity("error");
        toast.error("ARKTANAX could not respond. Your prompt is ready to retry.");
      }
    },
    [activeThreadId, sendMessageMutation, speakReply, stopSpeaking, utils.assistant.getThread, utils.assistant.listThreads],
  );

  const createNewThread = useCallback(async () => {
    if (!isAuthenticated) return startLogin();
    stopSpeaking();
    try {
      const thread = await createThreadMutation.mutateAsync({});
      setActiveThreadId(thread.id);
      setComposer("");
      setActivity("idle");
      await utils.assistant.listThreads.invalidate();
    } catch (error) {
      console.error(error);
      toast.error("Unable to start a new conversation.");
    }
  }, [createThreadMutation, isAuthenticated, stopSpeaking, utils.assistant.listThreads]);

  const removeCurrentThread = useCallback(async () => {
    if (!activeThreadId) return;
    const shouldDelete = window.confirm("Delete this ARKTANAX conversation? This cannot be undone.");
    if (!shouldDelete) return;

    try {
      await deleteThreadMutation.mutateAsync({ threadId: activeThreadId });
      setActiveThreadId(null);
      setComposer("");
      await utils.assistant.listThreads.invalidate();
    } catch (error) {
      console.error(error);
      toast.error("Unable to delete this conversation.");
    }
  }, [activeThreadId, deleteThreadMutation, utils.assistant.listThreads]);

  const finishRecording = useCallback(async () => {
    const recorded = new Blob(audioChunksRef.current, {
      type: recorderRef.current?.mimeType || "audio/webm",
    });
    audioChunksRef.current = [];
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;

    if (recorded.size === 0) {
      setActivity("error");
      toast.error("No audio was captured. Hold the microphone button while speaking.");
      return;
    }

    if (recorded.size > 16 * 1024 * 1024) {
      setActivity("error");
      toast.error("Voice recordings must be smaller than 16 MB.");
      return;
    }

    try {
      setActivity("transcribing");
      const audioData = await blobToDataUrl(recorded);
      const transcript = await transcribeMutation.mutateAsync({
        audioData,
        language: navigator.language?.split("-")[0] || "en",
      });
      setComposer(transcript.text);
      setActivity("idle");
      toast.success("Voice prompt transcribed. Review, edit, and send when ready.");
      requestAnimationFrame(() => composerRef.current?.focus());
    } catch (error) {
      console.error(error);
      setActivity("error");
      toast.error("ARKTANAX could not transcribe that recording. Please try again.");
    }
  }, [sendPrompt, transcribeMutation]);

  const startRecording = useCallback(async () => {
    if (!isAuthenticated) return startLogin();
    if (activity === "listening" || activity === "transcribing" || sendMessageMutation.isPending) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setActivity("error");
      toast.error("This browser does not support microphone recording.");
      return;
    }

    try {
      stopSpeaking();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"]
        .find(candidate => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void finishRecording();
      };
      recorder.start();
      setActivity("listening");
    } catch (error) {
      console.error(error);
      setActivity("error");
      toast.error("Microphone access was not granted. Check your browser permissions and try again.");
    }
  }, [activity, finishRecording, isAuthenticated, sendMessageMutation.isPending, stopSpeaking]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const visibleMessages = useMemo(() => {
    const pendingIsVisible = pendingMessage && pendingMessage.threadId === activeThreadId;
    return pendingIsVisible ? [...messages, { id: -1, role: "user" as const, content: pendingMessage.content, createdAt: new Date() }] : messages;
  }, [activeThreadId, messages, pendingMessage]);

  if (loading) {
    return <div className="min-h-screen bg-[#08030f]" aria-label="Loading ARKTANAX" />;
  }

  if (!user) {
    return (
      <main className="arktanax-shell flex min-h-screen items-end px-6 pb-10 sm:px-10 sm:pb-14 lg:px-16 lg:pb-20">
        <div className="arktanax-grid" />
        <section className="relative z-10 max-w-3xl">
          <p className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-teal-100/75">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-300" /> Personal AI interface
          </p>
          <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[0.89] tracking-[-0.065em] text-white sm:text-7xl lg:text-[7.5rem]">
            ARKTANAX
          </h1>
          <p className="mt-7 max-w-md text-base leading-relaxed text-violet-100/75 sm:text-lg">
            A focused conversation space for clear thinking, useful replies, and voice-first requests.
          </p>
          <button
            onClick={() => startLogin()}
            className="mt-9 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#140826] transition duration-200 hover:bg-teal-50 active:scale-[0.97]"
          >
            Enter ARKTANAX <ChevronRight className="h-4 w-4" />
          </button>
        </section>
        <aside className="absolute right-6 top-8 z-10 text-right sm:right-10 lg:right-16 lg:top-12">
          <p className="text-[10px] uppercase tracking-[0.28em] text-violet-100/50">Intelligence, in context</p>
          <p className="mt-2 text-xs text-violet-100/70">Sign in to begin a persistent conversation.</p>
        </aside>
      </main>
    );
  }

  return (
    <main className="arktanax-shell min-h-[100dvh] overflow-hidden">
      <div className="arktanax-grid" />
      <div className="arktanax-orb arktanax-orb-violet" />
      <div className="arktanax-orb arktanax-orb-teal" />

      <header className="relative z-20 flex items-start justify-between px-5 pt-5 sm:px-8 sm:pt-7 lg:px-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/15 text-white/80 backdrop-blur-md transition hover:border-teal-200/40 hover:bg-white/10 lg:hidden"
            aria-label="Open conversation history"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/8 text-teal-100"><Bot className="h-4 w-4" /></span>
            <span className="text-sm font-semibold tracking-[0.18em] text-white">ARKTANAX</span>
          </div>
          <span className="hidden h-px w-12 bg-white/15 sm:block" />
          <span className="hidden text-[10px] uppercase tracking-[0.22em] text-violet-100/55 sm:block">Personal reasoning interface</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden text-right sm:block">
            <p className="text-[10px] uppercase tracking-[0.24em] text-violet-100/55">Continuous context</p>
            <p className="mt-1 text-xs text-white/75">{threads.length} saved {threads.length === 1 ? "thread" : "threads"}</p>
          </div>
          <div className="ml-1 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-sm font-semibold text-white backdrop-blur-md" aria-label={`Signed in as ${user.name || "user"}`}>
            {user.name?.slice(0, 1).toUpperCase() || "A"}
          </div>
        </div>
      </header>

      <aside className={cn("arktanax-sidebar", isSidebarOpen && "arktanax-sidebar-open")}>
        <div className="flex items-center justify-between px-5 pb-5 pt-6">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-teal-100/55">Memory archive</p>
            <h2 className="mt-1 text-lg font-medium text-white">Conversations</h2>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/55 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close conversation history">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4">
          <button
            onClick={() => void createNewThread()}
            disabled={createThreadMutation.isPending}
            className="flex w-full items-center justify-between rounded-2xl border border-teal-200/20 bg-teal-200/[0.08] px-4 py-3 text-left text-sm text-teal-50 transition hover:border-teal-200/40 hover:bg-teal-100/[0.13] disabled:opacity-50"
          >
            <span className="flex items-center gap-2"><Plus className="h-4 w-4" /> New conversation</span>
            <Command className="h-3.5 w-3.5 text-teal-100/55" />
          </button>
        </div>

        <div className="mt-6 flex-1 overflow-y-auto px-3 pb-5">
          <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.24em] text-violet-100/40">Recent sessions</p>
          {threadsQuery.isLoading ? (
            <div className="space-y-2 px-2"><div className="h-11 rounded-xl bg-white/5" /><div className="h-11 rounded-xl bg-white/5" /></div>
          ) : threads.length === 0 ? (
            <p className="px-2 text-xs leading-relaxed text-violet-100/50">Your first conversation will remain here, ready to resume.</p>
          ) : (
            <div className="space-y-1">
              {threads.map(thread => (
                <button
                  key={thread.id}
                  onClick={() => { setActiveThreadId(thread.id); setIsSidebarOpen(false); setActivity("idle"); }}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition",
                    activeThreadId === thread.id ? "bg-white/[0.12] text-white" : "text-violet-100/62 hover:bg-white/[0.07] hover:text-white",
                  )}
                >
                  <MessageSquarePlus className="h-3.5 w-3.5 shrink-0 text-teal-200/70" />
                  <span className="min-w-0 flex-1 truncate text-sm">{thread.title}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:opacity-70" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-white/8 px-5 py-5">
          <div className="flex items-center justify-between text-xs text-violet-100/60">
            <span className="truncate">{user.name || "Signed-in user"}</span>
            <button onClick={logout} className="transition hover:text-white">Sign out</button>
          </div>
        </div>
      </aside>
      {isSidebarOpen && <button className="fixed inset-0 z-20 bg-[#06030d]/50 lg:hidden" onClick={() => setIsSidebarOpen(false)} aria-label="Close conversation history overlay" />}

      <section className="relative z-10 mx-auto flex w-full max-w-[1500px] flex-col px-5 pb-6 pt-10 sm:px-8 lg:min-h-[calc(100dvh-80px)] lg:pl-[25rem] lg:pr-14 lg:pt-10">
        <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.24em] text-teal-100/65">
              <span className={cn("h-1.5 w-1.5 rounded-full", activity === "error" ? "bg-rose-400" : activity === "thinking" || activity === "transcribing" ? "bg-amber-300 animate-pulse" : "bg-teal-300")} />
              {status.label}
            </div>
            <h1 className="mt-4 max-w-4xl text-pretty text-4xl font-semibold leading-[0.94] tracking-[-0.06em] text-white sm:text-5xl lg:text-7xl">
              {activeThread?.title || "A clear space to think."}
            </h1>
          </div>
          <p className="max-w-48 text-left text-[11px] leading-relaxed text-violet-100/55 sm:pt-2 sm:text-right">
            {status.detail}. ARKTANAX only acts within this conversation until integrations are connected.
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-[1.75rem] border border-white/10 bg-[#13092a]/35 backdrop-blur-xl shadow-[0_30px_80px_rgba(1,0,12,0.28)]">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-teal-100/15 bg-teal-100/[0.08] text-teal-100"><Waves className="h-3.5 w-3.5" /></span>
              <div>
                <p className="text-sm font-medium text-white">Active conversation</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-violet-100/45">{visibleMessages.length} contextual {visibleMessages.length === 1 ? "message" : "messages"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="relative">
                <button
                  onClick={() => setIsVoicePanelOpen(value => !value)}
                  className={cn("flex h-9 items-center gap-2 rounded-full px-3 text-xs transition", isMuted ? "bg-white/7 text-violet-100/60 hover:bg-white/12" : "bg-teal-100/[0.1] text-teal-50 hover:bg-teal-100/[0.16]")}
                  aria-expanded={isVoicePanelOpen}
                  aria-label="Open ARKTANAX voice controls"
                >
                  {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{isMuted ? "Voice muted" : "Voice"}</span>
                  <SlidersHorizontal className="hidden h-3 w-3 opacity-70 sm:block" />
                </button>
                {isVoicePanelOpen && (
                  <div className="absolute right-0 top-11 z-30 w-[18rem] rounded-2xl border border-white/12 bg-[#10061f]/95 p-4 shadow-2xl backdrop-blur-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-white">Voice presence</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-violet-100/55">ARKTANAX favors the most natural feminine English voice your device makes available.</p>
                      </div>
                      <button onClick={() => setIsVoicePanelOpen(false)} className="text-violet-100/50 transition hover:text-white" aria-label="Close voice controls"><X className="h-4 w-4" /></button>
                    </div>
                    <label className="mt-4 block text-[10px] uppercase tracking-[0.18em] text-violet-100/45" htmlFor="arktanax-voice">Available browser voices</label>
                    <select
                      id="arktanax-voice"
                      value={selectedVoice?.voiceURI || ""}
                      onChange={event => setSelectedVoiceURI(event.target.value)}
                      disabled={!speechAvailable || availableVoices.length === 0}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-xs text-white outline-none transition focus:border-teal-100/45 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {availableVoices.length === 0 ? <option value="">Loading device voices…</option> : availableVoices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}
                    </select>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={previewVoice}
                        disabled={!speechAvailable || availableVoices.length === 0}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-100/[0.12] px-3 py-2.5 text-xs font-medium text-teal-50 transition hover:bg-teal-100/[0.2] disabled:cursor-not-allowed disabled:opacity-50"
                      ><Waves className="h-3.5 w-3.5" /> Preview voice</button>
                      <button
                        onClick={() => setIsMuted(value => !value)}
                        className="rounded-xl border border-white/10 px-3 py-2.5 text-xs text-violet-100/75 transition hover:bg-white/10 hover:text-white"
                      >{isMuted ? "Unmute" : "Mute"}</button>
                    </div>
                    <p className="mt-3 text-[10px] leading-relaxed text-violet-100/40">Voices are supplied by Chrome and your operating system. Install an additional system voice if the list does not include one you like.</p>
                  </div>
                )}
              </div>
              <button
                onClick={stopSpeaking}
                className={cn("flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-xs transition", activity === "speaking" ? "bg-rose-300/15 text-rose-100 hover:bg-rose-300/25" : "bg-white/[0.06] text-violet-100/70 hover:bg-white/[0.12] hover:text-white")}
                aria-label="Stop ARKTANAX speech immediately"
                title="Stop ARKTANAX speech immediately"
              >
                <Square className="h-3 w-3 fill-current" />
                <span className="hidden sm:inline">Stop</span>
              </button>
              <button
                onClick={() => void removeCurrentThread()}
                disabled={!activeThreadId || deleteThreadMutation.isPending}
                className="flex h-9 w-9 items-center justify-center rounded-full text-violet-100/45 transition hover:bg-rose-400/10 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Delete conversation"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-[27rem] flex-1 overflow-y-auto px-5 py-7 sm:px-8 lg:max-h-[calc(100dvh-22rem)]">
            {threadQuery.isLoading ? (
              <div className="space-y-6"><div className="ml-auto h-16 w-2/5 rounded-2xl bg-white/7" /><div className="h-20 w-3/5 rounded-2xl bg-teal-100/[0.06]" /></div>
            ) : visibleMessages.length === 0 ? (
              <div className="flex min-h-[23rem] flex-col items-start justify-end pb-4">
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-teal-100/15 bg-teal-100/[0.08] text-teal-100"><Zap className="h-5 w-5" /></span>
                <p className="max-w-xl text-2xl font-medium leading-tight tracking-[-0.04em] text-white sm:text-3xl">No theatre. No disconnected buttons. Start with a real question.</p>
                <div className="mt-7 flex flex-wrap gap-2">
                  {QUICK_STARTERS.map(prompt => (
                    <button key={prompt} onClick={() => void sendPrompt(prompt)} className="rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-2 text-xs text-violet-100/75 transition hover:border-teal-100/30 hover:bg-teal-100/[0.08] hover:text-teal-50">
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-7">
                {visibleMessages.map(message => (
                  <article key={message.id} className={cn("flex gap-3 sm:gap-4", message.role === "user" ? "justify-end" : "justify-start")}>
                    {message.role === "assistant" && <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-teal-100/15 bg-teal-100/[0.08] text-teal-100"><Bot className="h-3.5 w-3.5" /></span>}
                    <div className={cn("max-w-[88%] sm:max-w-[76%]", message.role === "user" ? "order-first" : "") }>
                      <div className={cn("rounded-2xl px-4 py-3.5 sm:px-5", message.role === "user" ? "rounded-tr-sm bg-white text-[#160928]" : "rounded-tl-sm border border-white/8 bg-white/[0.055] text-violet-50") }>
                        {message.role === "assistant" ? (
                          <div className="arktanax-prose text-[15px] leading-7"><Streamdown>{message.content}</Streamdown></div>
                        ) : (
                          <p className="whitespace-pre-wrap text-[15px] leading-6">{message.content}</p>
                        )}
                      </div>
                      <p className={cn("mt-2 text-[10px] uppercase tracking-[0.16em]", message.role === "user" ? "text-right text-violet-100/40" : "text-violet-100/35")}>{message.role === "user" ? "You" : "ARKTANAX"} · {timeLabel(message.createdAt)}</p>
                    </div>
                  </article>
                ))}
                {sendMessageMutation.isPending && <div className="flex items-center gap-3 text-sm text-teal-50/80"><span className="flex h-8 w-8 items-center justify-center rounded-full border border-teal-100/15 bg-teal-100/[0.08]"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /></span><span>ARKTANAX is considering the active context.</span></div>}
                <div ref={conversationEndRef} />
              </div>
            )}
          </div>

          <form
            onSubmit={event => { event.preventDefault(); void sendPrompt(composer); }}
            className="border-t border-white/8 px-4 py-4 sm:px-5"
          >
            <div className="rounded-2xl border border-white/10 bg-[#080411]/45 p-2 shadow-inner shadow-black/20 transition focus-within:border-teal-100/35 focus-within:bg-[#090513]/70">
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onPointerDown={() => void startRecording()}
                  onPointerUp={stopRecording}
                  onPointerLeave={stopRecording}
                  onPointerCancel={stopRecording}
                  onKeyDown={event => { if (!event.repeat && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); void startRecording(); } }}
                  onKeyUp={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); stopRecording(); } }}
                  onContextMenu={event => event.preventDefault()}
                  disabled={activity === "transcribing" || activity === "thinking"}
                  className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-40", activity === "listening" ? "bg-rose-400 text-white shadow-[0_0_24px_rgba(251,113,133,0.55)]" : "bg-teal-100/[0.1] text-teal-100 hover:bg-teal-100/[0.18]")}
                  aria-label={activity === "listening" ? "Release to send voice request" : "Hold to speak to ARKTANAX"}
                  title="Hold to speak"
                >
                  {activity === "listening" ? <AudioLines className="h-4 w-4 animate-pulse" /> : <Mic className="h-4 w-4" />}
                </button>
                <textarea
                  ref={composerRef}
                  value={composer}
                  onChange={event => setComposer(event.target.value)}
                  onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendPrompt(composer); } }}
                  placeholder={activity === "listening" ? "Listening… release the microphone when finished" : "Ask ARKTANAX anything…"}
                  rows={1}
                  className="min-h-11 max-h-32 flex-1 resize-none bg-transparent px-2 py-3 text-[15px] leading-5 text-white placeholder:text-violet-100/35 focus:outline-none"
                  aria-label="Message ARKTANAX"
                />
                <button
                  type="submit"
                  disabled={!composer.trim() || sendMessageMutation.isPending || activity === "transcribing"}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#160928] transition hover:bg-teal-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Send message"
                >
                  {sendMessageMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex items-center justify-between px-2 pb-1 pt-2 text-[10px] uppercase tracking-[0.16em] text-violet-100/35">
                <span className="flex items-center gap-1.5"><MicOff className="h-3 w-3" /> Hold mic to speak</span>
                <span>Enter to send · Shift + Enter for a line break</span>
              </div>
            </div>
          </form>
        </div>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 px-1 text-[10px] uppercase tracking-[0.18em] text-violet-100/40">
          <span className="flex items-center gap-2"><Wifi className="h-3 w-3 text-teal-200/70" /> Secure conversation storage</span>
          <span className="flex items-center gap-2"><Cpu className="h-3 w-3 text-teal-200/70" /> No external tools connected</span>
          {activity === "error" && <button onClick={() => setActivity("idle")} className="flex items-center gap-2 text-amber-100/75 hover:text-amber-50"><AlertTriangle className="h-3 w-3" /> Reset status</button>}
        </footer>
      </section>
    </main>
  );
}
