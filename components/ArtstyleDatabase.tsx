import React, { useState, useEffect, useRef } from "react";
import { VisualDNA } from "../types";
import { 
  saveDNA, 
  deleteDNA, 
  syncLocalToCloud, 
  syncCloudAndLocal, 
  isFirestoreQuotaExceeded, 
  isCloudSyncEnabled,
  setCloudSyncEnabled,
  isSyncInProgress,
  getLastSyncAt,
  resetQuotaExceeded
} from "../services/cloudDnaService";
import { getLocalDNA, saveTokenLog } from "../services/localDbService";
import { analyzeReferenceImage, checkApiKey, promptApiKeySelection, extractUsageFromError, mapUsageMetadata } from "../services/geminiService";
import { mergeVisualDNA } from "../services/visualTags";
import { compressImage } from "../services/imageUtils";
import { auth, provider, signInWithPopup, signOut, onAuthStateChanged, User } from "../services/firebase";
import { 
  Database, Upload, Trash2, Edit2, Search, RefreshCw, BarChart3, Tag, 
  FileText, Check, AlertCircle, Sparkles, Sliders, ChevronDown, ChevronUp, 
  Image as ImageIcon, CheckCircle2, Eye, EyeOff, Save, X, Plus, Cloud, LogOut
} from "lucide-react";

interface ArtstyleDatabaseProps {
  onBackToGrimoire: () => void;
}

import { VISUAL_TAG_CATEGORIES, ALLOWED_VISUAL_TAGS, VISUAL_TAG_KEYWORDS } from "../services/visualTags";

const ALLOWED_TAGS = ALLOWED_VISUAL_TAGS;

const ArtstyleDatabase: React.FC<ArtstyleDatabaseProps> = ({ onBackToGrimoire }) => {
  const [dnaList, setDnaList] = useState<VisualDNA[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploadQueue, setUploadQueue] = useState<{ id: string; name: string; base64: string; status: 'pending' | 'analyzing' | 'done' | 'failed'; error?: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedDna, setSelectedDna] = useState<VisualDNA | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [analysisModel, setAnalysisModel] = useState<string>("gemini-3.5-flash");
  
  // Tag Filter States
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [tagFilterSearch, setTagFilterSearch] = useState<string>("");
  const [showTagBlocks, setShowTagBlocks] = useState<boolean>(true);

  const areAllCollapsed = Object.keys(VISUAL_TAG_CATEGORIES).every(cat => collapsedCategories[cat]);
  const handleToggleCollapseAll = () => {
    const nextState = !areAllCollapsed;
    const nextCollapsed: Record<string, boolean> = {};
    Object.keys(VISUAL_TAG_CATEGORIES).forEach(cat => {
      nextCollapsed[cat] = nextState;
    });
    setCollapsedCategories(nextCollapsed);
  };
  
  // Edit Form States
  const [editName, setEditName] = useState<string>("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editSummary, setEditSummary] = useState<string>("");
  const [editPositivePrompt, setEditPositivePrompt] = useState<string>("");
  const [editStyleAnchors, setEditStyleAnchors] = useState<string>("");
  const [newTagInput, setNewTagInput] = useState<string>("");
  const [duplicateWarning, setDuplicateWarning] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reanalyzingConfirmId, setReanalyzingConfirmId] = useState<string | null>(null);
  const [reanalyzingIds, setReanalyzingIds] = useState<Set<string>>(new Set());
  const [user, setUser] = useState<User | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [cloudSyncEnabled, setCloudSyncEnabledState] = useState<boolean>(isCloudSyncEnabled());
  const [syncStatusMsg, setSyncStatusMsg] = useState<string>("");
  const [lastSyncTime, setLastSyncTime] = useState<number>(getLastSyncAt());

  const fileInputRef = useRef<HTMLInputElement>(null);

  // References to keep the async loop immune to stale React state closures
  const uploadQueueRef = useRef(uploadQueue);
  const isProcessingQueueRef = useRef(false);
  const analyzingIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    uploadQueueRef.current = uploadQueue;
  }, [uploadQueue]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      // Load local data immediately so the database doesn't stay empty
      try {
        const localDna = await getLocalDNA();
        setDnaList(localDna);
      } catch (e) {
        console.error("Error loading local DNA initially", e);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSyncNow = async () => {
    if (!auth.currentUser) {
      setSyncStatusMsg("Please connect your Google account first to enable cloud sync.");
      setTimeout(() => setSyncStatusMsg(""), 5000);
      return;
    }
    if (isSyncInProgress()) {
      setSyncStatusMsg("Synchronization is already in progress.");
      setTimeout(() => setSyncStatusMsg(""), 5000);
      return;
    }
    
    setSyncing(true);
    setSyncStatusMsg("Running full bidirectional synchronization...");
    try {
      const result = await syncCloudAndLocal();
      setDnaList(result.records);
      setLastSyncTime(getLastSyncAt());
      
      if (result.completed) {
        setSyncStatusMsg("Sync complete. Cloud and local databases are fully synchronized.");
      } else if (result.partial) {
        setSyncStatusMsg(`Local data updated, but some cloud operations failed. (${result.failures.length} failed)`);
      } else if (result.quotaExceeded) {
        setSyncStatusMsg("Firestore daily free quota limit exceeded. Sync paused.");
      } else {
        const errors = result.failures.map(f => f.message).join(", ");
        setSyncStatusMsg(`Sync failed: ${errors || "Unknown error"}`);
      }
      setTimeout(() => setSyncStatusMsg(""), 5000);
    } catch (e: unknown) {
      console.error("Manual sync failed", e);
      const msg = e instanceof Error ? e.message : String(e);
      setSyncStatusMsg(`Sync failed: ${msg}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleRetryCloudSync = () => {
    resetQuotaExceeded();
    handleSyncNow();
  };

  const handleToggleCloudSync = (enabled: boolean) => {
    setCloudSyncEnabled(enabled);
    setCloudSyncEnabledState(enabled);
    if (enabled) {
      setSyncStatusMsg("Cloud Sync enabled. Click 'Sync Now' to sync existing records.");
    } else {
      setSyncStatusMsg("Cloud Sync disabled.");
    }
    setTimeout(() => setSyncStatusMsg(""), 5000);
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error("Login failed", e);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const loadDatabase = async () => {
    if (dnaList.length === 0) {
      setLoading(true);
    }
    try {
      const allDna = await getLocalDNA();
      setDnaList(allDna);
    } catch (err) {
      console.error("Failed to load visual DNA from IndexedDB", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const skippedNames: string[] = [];
    const validFiles: File[] = [];

    Array.from(files).forEach((file: File) => {
      const nameOnly = file.name.split(".")[0];
      const existsInDb = dnaList.some(dna => dna.name.toLowerCase() === nameOnly.toLowerCase());
      const existsInQueue = uploadQueue.some(q => q.name.toLowerCase() === nameOnly.toLowerCase());

      if (existsInDb || existsInQueue) {
        skippedNames.push(file.name);
      } else {
        validFiles.push(file);
      }
    });

    if (skippedNames.length > 0) {
      setDuplicateWarning(skippedNames);
    } else {
      setDuplicateWarning([]);
    }

    validFiles.forEach(async (file) => {
      const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
      
      try {
        const compressedBase64 = await compressImage(file, 800, 800, 0.8);
        setUploadQueue(prev => [
          ...prev,
          {
            id,
            name: file.name.split(".")[0],
            base64: compressedBase64,
            status: 'pending'
          }
        ]);
      } catch (err) {
        console.error("Failed to compress image:", err);
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const startAnalysis = async (itemId: string, sessionId?: string) => {
    if (analyzingIdsRef.current.has(itemId)) return;

    const item = uploadQueueRef.current.find(i => i.id === itemId);
    if (!item) return;

    // Prevent double execution on items already analyzing or done
    if (item.status === 'analyzing' || item.status === 'done') return;

    analyzingIdsRef.current.add(itemId);
    setUploadQueue(prev => prev.map(i => i.id === itemId ? { ...i, status: 'analyzing', error: undefined } : i));

    const startTime = Date.now();
    try {
      const result = await analyzeReferenceImage(item.base64, item.name, analysisModel);
      const analysisResult = result.data;
      
      const fullDna: VisualDNA = mergeVisualDNA({
        id: itemId,
        name: item.name,
        imageUrl: item.base64
      }, analysisResult);

      await saveDNA(fullDna);
      
      setUploadQueue(prev => prev.map(i => i.id === itemId ? { ...i, status: 'done' } : i));
      
      // Update local db state
      const updatedList = await getLocalDNA();
      setDnaList(updatedList);

      // Automatically select if it was the only one (non-stale update helper)
      setSelectedDna(prev => prev || fullDna);

      // Log usage
      const durationMs = Date.now() - startTime;
      await saveTokenLog({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        operationType: sessionId ? "analyze_all" : "analyze_image",
        model: analysisModel,
        ...mapUsageMetadata(result.usageMetadata),
        success: true,
        sessionId,
        durationMs
      });

    } catch (err: unknown) {
      console.error("Error analyzing image:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setUploadQueue(prev => prev.map(i => i.id === itemId ? { ...i, status: 'failed', error: errorMessage || "Failed to analyze." } : i));
      
      const durationMs = Date.now() - startTime;
      const usageMeta = extractUsageFromError(err);
      await saveTokenLog({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        operationType: sessionId ? "analyze_all" : "analyze_image",
        model: analysisModel,
        ...mapUsageMetadata(usageMeta),
        success: false,
        errorMessage: errorMessage || "Unknown error",
        sessionId,
        durationMs
      });

    } finally {
      analyzingIdsRef.current.delete(itemId);
    }
  };

  const startAllPending = async () => {
    if (isProcessingQueueRef.current) return;

    isProcessingQueueRef.current = true;
    const attemptedIds = new Set<string>();
    const sessionId = crypto.randomUUID();

    try {
      while (true) {
        // Find next item to analyze from the up-to-date queue reference
        const nextItem = uploadQueueRef.current.find(i => 
          (i.status === 'pending' || i.status === 'failed') && !attemptedIds.has(i.id)
        );
        if (!nextItem) break;

        attemptedIds.add(nextItem.id);
        await startAnalysis(nextItem.id, sessionId);
      }
    } finally {
      isProcessingQueueRef.current = false;
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    if (deletingId !== id) {
      setDeletingId(id);
      setTimeout(() => {
        setDeletingId(current => current === id ? null : current);
      }, 3000);
      return;
    }

    try {
      await deleteDNA(id);
      setDnaList(prev => prev.filter(item => item.id !== id));
      if (selectedDna?.id === id) {
        setSelectedDna(null);
        setIsEditing(false);
      }
      setDeletingId(null);
    } catch (err) {
      console.error("Failed to delete Visual DNA", err);
    }
  };

  const handleReanalyze = async (dna: VisualDNA) => {
    if (analyzingIdsRef.current.has(dna.id) || reanalyzingIds.has(dna.id)) return;
    
    if (reanalyzingConfirmId !== dna.id) {
      setReanalyzingConfirmId(dna.id);
      setTimeout(() => {
        setReanalyzingConfirmId(current => current === dna.id ? null : current);
      }, 3000);
      return;
    }
    
    setReanalyzingConfirmId(null);
    analyzingIdsRef.current.add(dna.id);
    setReanalyzingIds(prev => {
      const next = new Set(prev);
      next.add(dna.id);
      return next;
    });
    setSyncStatusMsg(`Reanalisando "${dna.name}"... Extraindo DNA visual com IA...`);

    // Add to upload queue as analyzing
    const queueId = dna.id;
    setUploadQueue(prev => [
      ...prev,
      {
        id: queueId,
        name: dna.name,
        base64: dna.imageUrl,
        status: 'analyzing'
      }
    ]);

    const startTime = Date.now();
    try {
      const result = await analyzeReferenceImage(dna.imageUrl, dna.name, analysisModel);
      const analysisResult = result.data;
      
      const updatedDna: VisualDNA = mergeVisualDNA(dna, analysisResult);

      await saveDNA(updatedDna);
      setUploadQueue(prev => prev.filter(i => i.id !== queueId));
      
      // Reload list
      const allDna = await getLocalDNA();
      setDnaList(allDna);
      setSelectedDna(updatedDna);
      setSyncStatusMsg(`Reanálise concluída com sucesso para "${updatedDna.name}"!`);
      setTimeout(() => setSyncStatusMsg(""), 5000);

      const durationMs = Date.now() - startTime;
      await saveTokenLog({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        operationType: "reanalyze_image",
        model: analysisModel,
        ...mapUsageMetadata(result.usageMetadata),
        success: true,
        durationMs
      });
    } catch (err: unknown) {
      console.error("Error reanalyzing image:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setSyncStatusMsg("Erro na reanálise: " + (errorMessage || "Unknown error"));
      setTimeout(() => setSyncStatusMsg(""), 6000);
      setUploadQueue(prev => prev.map(i => i.id === queueId ? { ...i, status: 'failed', error: errorMessage || "Failed to analyze." } : i));
      
      const durationMs = Date.now() - startTime;
      const usageMeta = extractUsageFromError(err);
      await saveTokenLog({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        operationType: "reanalyze_image",
        model: analysisModel,
        ...mapUsageMetadata(usageMeta),
        success: false,
        errorMessage: errorMessage || "Unknown error",
        durationMs
      });
    } finally {
      analyzingIdsRef.current.delete(dna.id);
      setReanalyzingIds(prev => {
        const next = new Set(prev);
        next.delete(dna.id);
        return next;
      });
    }
  };

  const handleEditClick = () => {
    if (!selectedDna) return;
    setEditName(selectedDna.name);
    setEditTags([...(selectedDna.tags || [])]);
    setEditSummary(selectedDna.summary || "");
    setEditPositivePrompt(selectedDna.positivePrompt || "");
    setEditStyleAnchors(selectedDna.styleAnchors || "");
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedDna) return;
    const nameOnly = editName.trim();
    if (!nameOnly) return;

    // Check if another memory already has this exact name
    const nameExists = dnaList.some(dna => dna.id !== selectedDna.id && dna.name.toLowerCase() === nameOnly.toLowerCase());
    if (nameExists) {
      setDuplicateWarning([`The name "${nameOnly}" is already used by another memory inside the database.`]);
      return;
    }

    const updatedDna: VisualDNA = {
      ...selectedDna,
      name: nameOnly,
      tags: editTags,
      summary: editSummary,
      positivePrompt: editPositivePrompt,
      styleAnchors: editStyleAnchors
    };

    try {
      await saveDNA(updatedDna);
      setSelectedDna(updatedDna);
      setDnaList(prev => prev.map(item => item.id === selectedDna.id ? updatedDna : item));
      setIsEditing(false);
      setDuplicateWarning([]);
    } catch (err) {
      console.error("Failed to save visual DNA edit", err);
    }
  };

  const addTag = () => {
    const cleanTag = newTagInput.trim().toLowerCase();
    if (cleanTag && !editTags.includes(cleanTag)) {
      setEditTags(prev => [...prev, cleanTag]);
      setNewTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setEditTags(prev => prev.filter(t => t !== tagToRemove));
  };

  const clearQueue = () => {
    setUploadQueue([]);
  };

  // Filter List
  const filteredList = dnaList.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.summary.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTag = selectedTag ? (item.tags || []).includes(selectedTag) : true;
    
    return matchesSearch && matchesTag;
  });

  return (
    <div className="flex flex-col lg:flex-row gap-8 w-full min-h-full items-start">
      
      {/* Left panel: Reference List and Upload queue */}
      <div className="flex-1 w-full flex flex-col gap-6">
        
        {/* Duplicate Warning Banner */}
        {duplicateWarning.length > 0 && (
          <div className="bg-amber-950/20 border border-amber-900/30 text-amber-200 text-xs p-4 rounded-2xl flex items-start gap-3 relative overflow-hidden animate-fade-in">
            <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h5 className="font-bold uppercase tracking-wider text-[10px] text-amber-400 mb-1">Duplicated Reference Blocked</h5>
              <p className="text-[11px] leading-relaxed text-amber-200/80">
                The following request/file was skipped because a memory with the same name already exists in your local database or active queue:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-0.5 text-[10px] font-mono text-stone-300">
                {duplicateWarning.map((name, i) => (
                  <li key={i} className="truncate max-w-full" title={name}>{name}</li>
                ))}
              </ul>
            </div>
            <button 
              onClick={() => setDuplicateWarning([])}
              className="text-stone-400 hover:text-stone-200 p-1 transition-all"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Database Stats and Actions */}
        <div className="bg-stone-900/30 p-5 rounded-2xl border border-stone-800/80">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 text-amber-500">
                <Database size={20} className="shrink-0" />
                <h3 className="font-serif text-lg md:text-xl font-bold tracking-wide">Artstyle DNA Repository</h3>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1.5">
                <p className="text-xs text-stone-500">
                  {dnaList.length} global design matrices synthesized and saved locally.
                </p>
              </div>

              <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-stone-800/60">
                <div className="flex flex-wrap items-center justify-between gap-4 bg-stone-950/40 p-4 rounded-xl border border-stone-800/40">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-stone-400 text-xs font-bold uppercase tracking-wider">Cloud Synchronization</span>
                      <div className="flex items-center gap-1">
                        {cloudSyncEnabled ? (
                          <span className="px-2 py-0.5 bg-green-900/20 text-green-400 border border-green-900/40 rounded text-[9px] font-bold uppercase">ON</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-stone-900 text-stone-500 border border-stone-800 rounded text-[9px] font-bold uppercase">OFF</span>
                        )}
                        {isFirestoreQuotaExceeded() && (
                          <span className="px-2 py-0.5 bg-red-950/20 text-red-400 border border-red-900/30 rounded text-[9px] font-bold uppercase animate-pulse">Quota Exceeded</span>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-stone-500 leading-normal max-w-lg">
                      {user 
                        ? "Backup your style DNA to the secure cloud. When OFF, saving/deleting is fully local."
                        : "Connect your Google Account to backup and sync your custom visual styles across devices."}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {user ? (
                      <div className="flex items-center gap-2">
                        {/* Toggle button */}
                        <div className="flex items-center bg-stone-900 p-0.5 rounded border border-stone-800">
                          <button
                            onClick={() => handleToggleCloudSync(true)}
                            className={`px-3 py-1 text-[10px] font-bold uppercase rounded ${cloudSyncEnabled ? 'bg-amber-600 text-white' : 'text-stone-500 hover:text-stone-300'}`}
                          >
                            ON
                          </button>
                          <button
                            onClick={() => handleToggleCloudSync(false)}
                            className={`px-3 py-1 text-[10px] font-bold uppercase rounded ${!cloudSyncEnabled ? 'bg-stone-800 text-stone-300' : 'text-stone-500'}`}
                          >
                            OFF
                          </button>
                        </div>

                        {/* Logout */}
                        <button 
                          onClick={handleLogout} 
                          className="p-1.5 text-stone-500 hover:text-red-400 transition-colors bg-stone-900 rounded border border-stone-800 cursor-pointer" 
                          title="Disconnect Account"
                        >
                          <LogOut size={14} />
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={handleLogin} 
                        className="flex items-center gap-2 px-4 py-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-350 hover:text-amber-500 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                      >
                        <Cloud size={13} />
                        Connect Account
                      </button>
                    )}
                  </div>
                </div>

                {/* Firestore metrics & manual sync buttons */}
                {user && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1 bg-stone-950/20 p-3 rounded-xl border border-stone-850/60">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-stone-950/60 p-2 rounded-lg border border-stone-900">
                        <span className="text-[9px] text-stone-500 block uppercase tracking-wider font-bold">Local Records</span>
                        <span className="text-sm font-bold text-stone-300">{dnaList.length}</span>
                      </div>
                      <div className="bg-stone-950/60 p-2 rounded-lg border border-stone-900">
                        <span className="text-[9px] text-stone-500 block uppercase tracking-wider font-bold">Status</span>
                        {isFirestoreQuotaExceeded() ? (
                          <span className="text-xs font-bold text-red-400 uppercase tracking-tight block mt-0.5">Quota Exceeded</span>
                        ) : syncing ? (
                          <span className="text-xs font-bold text-green-400 uppercase tracking-tight block animate-pulse mt-0.5">Syncing...</span>
                        ) : cloudSyncEnabled ? (
                          <span className="text-xs font-bold text-green-400 uppercase tracking-tight block mt-0.5">Enabled</span>
                        ) : (
                          <span className="text-xs font-bold text-stone-500 uppercase tracking-tight block mt-0.5">Disabled</span>
                        )}
                      </div>
                      <div className="bg-stone-950/60 p-2 rounded-lg border border-stone-900">
                        <span className="text-[9px] text-stone-500 block uppercase tracking-wider font-bold">Last Sync</span>
                        <span className="text-xs font-bold text-stone-400 block mt-0.5 truncate">
                          {lastSyncTime > 0 ? new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "Never"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3">
                      {isFirestoreQuotaExceeded() ? (
                        <button
                          onClick={handleRetryCloudSync}
                          className="flex items-center justify-center gap-1.5 h-10 px-4 bg-amber-600/20 hover:bg-amber-600/35 border border-amber-600/40 text-amber-300 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all w-full md:w-auto cursor-pointer"
                        >
                          <RefreshCw size={13} className="shrink-0" />
                          Retry Cloud Sync
                        </button>
                      ) : (
                        <button
                          onClick={handleSyncNow}
                          disabled={syncing || !cloudSyncEnabled}
                          className={`flex items-center justify-center gap-1.5 h-10 px-4 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all w-full md:w-auto ${
                            syncing || !cloudSyncEnabled
                              ? 'bg-stone-850 border border-stone-800 text-stone-600 cursor-not-allowed'
                              : 'bg-stone-900 hover:bg-stone-850 border border-stone-800 text-amber-400 hover:text-amber-300 cursor-pointer'
                          }`}
                        >
                          {syncing ? (
                            <>
                              <RefreshCw size={13} className="animate-spin shrink-0" />
                              Syncing...
                            </>
                          ) : (
                            <>
                              <Cloud size={13} className="shrink-0" />
                              Sync Now
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Toast status message banner */}
                {syncStatusMsg && (
                  <div className="bg-stone-950/80 border border-stone-850 px-4 py-2.5 rounded-lg text-stone-300 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 animate-fade-in">
                    <RefreshCw size={12} className={syncing ? "animate-spin text-amber-500" : "text-green-500"} />
                    <span>{syncStatusMsg}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 w-full md:w-56 shrink-0">
              <div className="flex items-center justify-between h-9 gap-1.5 bg-stone-950/60 border border-stone-800/80 px-3 rounded-lg text-stone-400 select-none w-full">
                <span className="text-[9px] font-bold uppercase tracking-widest text-stone-500 whitespace-nowrap">AI Model:</span>
                <select
                  value={analysisModel}
                  onChange={(e) => setAnalysisModel(e.target.value)}
                  className="bg-transparent text-[10px] font-bold text-amber-500 focus:outline-none cursor-pointer uppercase tracking-wider border-none p-0 pr-1 h-full text-right"
                >
                  <option value="gemini-3.1-pro-preview" className="bg-stone-950 text-stone-300">3.1 Pro</option>
                  <option value="gemini-3.5-flash" className="bg-stone-950 text-stone-300">3.5 Flash</option>
                </select>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 h-9 px-4 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all shadow-md shadow-amber-950/20 whitespace-nowrap cursor-pointer"
              >
                <Upload size={13} className="shrink-0" />
                Import References
              </button>
              <button
                onClick={onBackToGrimoire}
                className="w-full flex items-center justify-center gap-2 h-9 px-4 bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-stone-700 transition-all whitespace-nowrap cursor-pointer"
              >
                <Sparkles size={13} className="text-amber-500 shrink-0" />
                Forge Cards
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                multiple
                accept="image/*"
                className="hidden"
              />
            </div>
          </div>

          {/* Tag filtering list & panel */}
          <div className="mt-5 border-t border-stone-800/60 pt-5 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <Tag size={14} className="text-amber-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Filter by Visual Tag</span>
              </div>
              
              {/* Search filter tags */}
              <div className="relative w-full sm:w-60">
                <Search size={12} className="absolute left-2.5 top-2.5 text-stone-500" />
                <input
                  type="text"
                  placeholder="Search tags..."
                  value={tagFilterSearch}
                  onChange={(e) => setTagFilterSearch(e.target.value)}
                  className="w-full bg-stone-950/80 border border-stone-800 rounded px-2.5 pl-8 py-1.5 text-[11px] text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-600 transition-all font-mono"
                />
                {tagFilterSearch && (
                  <button 
                    onClick={() => setTagFilterSearch("")}
                    className="absolute right-2 top-2.5 text-stone-500 hover:text-stone-350 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedTag(null)}
                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${!selectedTag ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm shadow-amber-950/20' : 'bg-stone-950/40 text-stone-500 hover:text-stone-350 border border-stone-800/40'}`}
              >
                All MEMORIES
              </button>
              {selectedTag && !ALLOWED_TAGS.includes(selectedTag) && (
                <button
                  onClick={() => setSelectedTag(null)}
                  className="px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 cursor-pointer"
                >
                  <span>{selectedTag} (Custom)</span>
                  <X size={10} />
                </button>
              )}

              <div className="h-4 w-[1px] bg-stone-800/60 self-center mx-1" />

              <button
                onClick={handleToggleCollapseAll}
                className="px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-stone-950/40 text-stone-400 hover:text-stone-200 border border-stone-800/40 hover:border-stone-700 flex items-center gap-1.5 transition-all cursor-pointer"
                title={areAllCollapsed ? "Expandir todos os blocos" : "Recolher todos os blocos"}
              >
                {areAllCollapsed ? <ChevronDown size={11} className="text-amber-500" /> : <ChevronUp size={11} className="text-amber-500" />}
                <span>{areAllCollapsed ? 'Expandir Blocos' : 'Recolher Blocos'}</span>
              </button>

              <button
                onClick={() => setShowTagBlocks(!showTagBlocks)}
                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5 transition-all cursor-pointer ${
                  showTagBlocks 
                    ? 'bg-stone-950/40 text-stone-400 hover:text-stone-200 border-stone-800/40 hover:border-stone-700' 
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/15'
                }`}
                title={showTagBlocks ? "Ocultar blocos de tags" : "Mostrar blocos de tags"}
              >
                {showTagBlocks ? <Eye size={11} className="text-amber-500" /> : <EyeOff size={11} className="text-amber-500" />}
                <span>{showTagBlocks ? 'Ocultar Blocos' : 'Mostrar Blocos'}</span>
              </button>
            </div>

            {/* Categorized Collapsible Tag Sections */}
            {showTagBlocks && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-3">
              {Object.entries(VISUAL_TAG_CATEGORIES).map(([category, tags]) => {
                // Filter tags in this category by search input
                const matchedTags = tags.filter(tag => 
                  tag.toLowerCase().includes(tagFilterSearch.toLowerCase())
                );

                if (tagFilterSearch && matchedTags.length === 0) {
                  return null;
                }

                const isCollapsed = collapsedCategories[category];

                return (
                  <div key={category} className="bg-stone-950/25 border border-stone-850/60 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setCollapsedCategories(prev => ({ ...prev, [category]: !prev[category] }))}
                      className="w-full flex items-center justify-between p-3 bg-stone-950/50 hover:bg-stone-900/30 transition-colors border-b border-stone-850/40 text-left cursor-pointer"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 font-mono">
                        {category}
                      </span>
                      {isCollapsed ? <ChevronDown size={12} className="text-stone-500" /> : <ChevronUp size={12} className="text-stone-500" />}
                    </button>
                    
                    {!isCollapsed && (
                      <div className="p-3 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto scrollbar-thin">
                        {matchedTags.map(tag => {
                          const count = dnaList.filter(item => (item.tags || []).includes(tag)).length;
                          const isSelected = selectedTag === tag;
                          return (
                            <button
                              key={tag}
                              onClick={() => setSelectedTag(isSelected ? null : tag)}
                              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                                isSelected 
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                                  : count === 0
                                    ? 'bg-stone-950/20 text-stone-600 opacity-40 hover:opacity-100 hover:text-stone-400 border border-stone-900'
                                    : 'bg-stone-950/40 text-stone-500 hover:text-stone-300 border border-stone-800/40'
                              }`}
                            >
                              <span>{tag}</span>
                              <span className={`text-[8px] px-1 rounded ${isSelected ? 'bg-amber-900/40 text-amber-400' : 'bg-stone-900 text-stone-600'}`}>{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>
        </div>

        {/* Upload & Analysis Queue Panel */}
        {uploadQueue.length > 0 && (
          <div className="bg-stone-900/60 p-5 rounded-2xl border border-amber-900/25 ring-1 ring-amber-900/5">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <RefreshCw size={14} className="text-amber-500 animate-spin-slow" />
                <h4 className="text-xs font-bold uppercase tracking-widest text-stone-300">Analysis Queue ({uploadQueue.length})</h4>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={startAllPending} 
                  className="px-3 py-1 bg-amber-900/20 hover:bg-amber-900/40 text-amber-300 border border-amber-900/30 text-[10px] font-bold uppercase tracking-widest rounded transition-all"
                >
                  Analyze All
                </button>
                <button 
                  onClick={clearQueue} 
                  className="px-3 py-1 bg-stone-950/80 hover:bg-stone-900 text-stone-400 text-[10px] font-bold uppercase tracking-widest rounded transition-all"
                >
                  Dismiss Queue
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
              {uploadQueue.map((item) => (
                <div key={item.id} className="flex gap-3 p-2 bg-stone-950/60 rounded-xl border border-stone-800/80 items-center justify-between overflow-hidden">
                  <div className="flex gap-3 items-center min-w-0">
                    <img src={item.base64} alt="preview" className="w-10 h-10 object-cover rounded bg-black" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-stone-300 truncate">{item.name}</p>
                      {item.status === 'pending' && <p className="text-[9px] text-stone-500 uppercase tracking-wider mt-0.5">Ready for AI parsing</p>}
                      {item.status === 'analyzing' && <p className="text-[9px] text-amber-500 animate-pulse uppercase tracking-wider mt-0.5">Extracting visual DNA...</p>}
                      {item.status === 'done' && <p className="text-[9px] text-green-400 flex items-center gap-1 uppercase tracking-wider mt-0.5"><Check size={10} /> Saved to grimoire</p>}
                      {item.status === 'failed' && <p className="text-[9px] text-red-400 flex items-center gap-1 uppercase tracking-wider mt-0.5 truncate" title={item.error}><AlertCircle size={10} /> Error</p>}
                    </div>
                  </div>
                  {item.status === 'pending' && (
                    <button 
                      onClick={() => startAnalysis(item.id)}
                      className="p-1.5 bg-amber-700/20 text-amber-400 hover:bg-amber-700/40 rounded border border-amber-700/30 text-[9px] font-bold"
                    >
                      Analyze
                    </button>
                  )}
                  {item.status === 'failed' && (
                    <button 
                      onClick={() => startAnalysis(item.id)}
                      className="p-1.5 bg-stone-800 text-stone-400 hover:text-amber-400 rounded text-[9px] font-bold"
                      title="Retry"
                    >
                      Retry
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reference List */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <div className="relative flex-1 max-w-xs sm:max-w-md">
              <Search className="absolute left-3 top-2.5 text-stone-600" size={14} />
              <input
                type="text"
                placeholder="Search Visual Memories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-stone-900/60 border border-stone-800 rounded-full pl-9 pr-4 py-2 text-xs text-stone-300 placeholder-stone-600 focus:outline-none focus:border-amber-600 transition-all"
              />
            </div>
            <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">
              Showing {filteredList.length} of {dnaList.length}
            </p>
          </div>

          {loading ? (
            <div className="py-20 text-center text-xs text-stone-500 animate-pulse uppercase tracking-widest">
              Summoning records...
            </div>
          ) : filteredList.length === 0 ? (
            <div className="bg-stone-900/10 border border-stone-900/50 rounded-2xl py-20 text-center text-stone-600 text-xs italic">
              {dnaList.length === 0 
                ? "Art DNA database is empty. Import references to seed the Visual Memory!"
                : "No matching visual memories found in current index."}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredList.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedDna(item);
                    setIsEditing(false);
                  }}
                  className={`group cursor-pointer rounded-xl border overflow-hidden bg-stone-900/20 hover:bg-stone-900/40 hover:border-stone-700 transition-all ${selectedDna?.id === item.id ? 'border-amber-600 ring-1 ring-amber-600/30 bg-stone-900/50' : 'border-stone-800/80'}`}
                >
                  <div className="relative aspect-[4/3] bg-black overflow-hidden">
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    {reanalyzingIds.has(item.id) && (
                      <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-10">
                        <RefreshCw size={16} className="text-amber-500 animate-spin" />
                        <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-amber-500 animate-pulse">Reanalisando...</span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-950 to-transparent p-3 pt-8">
                      <h4 className="text-xs font-bold text-stone-200 truncate">{item.name}</h4>
                      <p className="text-[10px] text-stone-400 mt-0.5 line-clamp-1 italic">"{item.summary}"</p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(item.id, e)}
                      className={`absolute top-2 right-2 p-1.5 rounded-md transition-all ${
                        deletingId === item.id 
                          ? 'bg-red-900/90 text-red-100 opacity-100 ring-1 ring-red-500' 
                          : 'bg-stone-950/80 text-stone-500 hover:text-red-400 hover:bg-stone-900 opacity-0 group-hover:opacity-100'
                      }`}
                      title={deletingId === item.id ? "Click again to confirm" : "Delete profile"}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  
                  <div className="p-3">
                    {/* Render top 3 tags */}
                    <div className="flex flex-wrap gap-1">
                      {(item.tags || []).slice(0, 3).map(t => (
                        <span key={t} className="text-[9px] bg-stone-950/80 text-stone-400 px-2 py-0.5 rounded uppercase tracking-wider font-semibold border border-stone-800/60">
                          {t}
                        </span>
                      ))}
                      {(item.tags || []).length > 3 && (
                        <span className="text-[9px] text-stone-600 font-bold self-center ml-1">
                          +{(item.tags || []).length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: Details view of Selected Reference */}
      <div className="w-full lg:w-[380px] xl:w-[440px] shrink-0 sticky top-24">
        {selectedDna ? (
          <div className="bg-stone-900/40 rounded-2xl border border-stone-800 overflow-hidden flex flex-col shadow-2xl">
            
            {/* Header image with edit/delete buttons */}
            <div className="relative aspect-video bg-black overflow-hidden">
              <img src={selectedDna.imageUrl} alt={selectedDna.name} className="w-full h-full object-cover" />
              {reanalyzingIds.has(selectedDna.id) && (
                <div className="absolute inset-0 bg-stone-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-10">
                  <RefreshCw size={20} className="text-amber-500 animate-spin" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-500 animate-pulse">Reanalisando estilo...</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/20 to-transparent" />
              <div className="absolute top-4 right-4 flex gap-2">
                {!isEditing ? (
                  <>
                    <button 
                      onClick={handleEditClick} 
                      className="p-2 rounded-md bg-stone-950/90 text-stone-300 hover:text-amber-500 hover:bg-stone-900 transition-all border border-stone-800"
                      title="Edit memory details"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button 
                      onClick={() => !reanalyzingIds.has(selectedDna.id) && handleReanalyze(selectedDna)} 
                      disabled={reanalyzingIds.has(selectedDna.id)}
                      className={`p-2 rounded-md transition-all border ${
                        reanalyzingIds.has(selectedDna.id)
                          ? 'bg-amber-900/40 text-amber-500 border-amber-900/30 cursor-not-allowed animate-pulse'
                          : reanalyzingConfirmId === selectedDna.id
                            ? 'bg-amber-900/95 text-amber-100 border-amber-500 animate-pulse'
                            : 'bg-stone-950/90 text-stone-300 hover:text-amber-500 hover:bg-stone-900 border-stone-800'
                      }`}
                      title={
                        reanalyzingIds.has(selectedDna.id) 
                          ? "Reanalisando estilo..." 
                          : reanalyzingConfirmId === selectedDna.id 
                            ? "Click again to confirm reanalysis" 
                            : "Re-run Gemini analysis"
                      }
                    >
                      <RefreshCw size={12} className={reanalyzingIds.has(selectedDna.id) || reanalyzingConfirmId === selectedDna.id ? "animate-spin" : ""} />
                    </button>
                    <button 
                      onClick={() => handleDelete(selectedDna.id)} 
                      className={`p-2 rounded-md transition-all border ${
                        deletingId === selectedDna.id
                          ? 'bg-red-900/90 text-red-100 border-red-500'
                          : 'bg-stone-950/90 text-stone-300 hover:text-red-400 hover:bg-stone-900 border-stone-800'
                      }`}
                      title={deletingId === selectedDna.id ? "Click again to confirm" : "Delete profile"}
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => setIsEditing(false)} 
                    className="p-2 rounded-md bg-stone-950/90 text-stone-300 hover:text-white hover:bg-stone-900 transition-all border border-stone-800"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="absolute inset-x-0 bottom-0 p-5">
                {isEditing ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-stone-900/90 border border-amber-600 rounded px-3 py-1 text-sm font-bold text-stone-100 focus:outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-base font-serif font-bold text-stone-100 tracking-wide">{selectedDna.name}</h4>
                    {Number(selectedDna.analysisVersion) === 3 ? (
                      <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[8px] font-bold font-mono uppercase rounded tracking-wider">
                        V3 Engine
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-stone-950 text-stone-500 border border-stone-900 text-[8px] font-bold font-mono uppercase rounded tracking-wider">
                        Legacy Engine
                      </span>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-stone-400 italic mt-1 font-medium">"{selectedDna.summary}"</p>
              </div>
            </div>

            {/* Content Scrolling Area */}
            <div className="p-5 overflow-y-auto max-h-[50vh] lg:max-h-[55vh] xl:max-h-[60vh] space-y-6 scrollbar-thin">
              
              {/* Tags Section */}
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1.5 mb-2.5">
                  <Tag size={12} /> Meta Tags
                </label>
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Summary</label>
                       <textarea className="w-full bg-stone-900 border border-stone-800 rounded p-2 text-xs text-stone-300 focus:border-amber-600 focus:outline-none min-h-[60px]" value={editSummary} onChange={(e) => setEditSummary(e.target.value)} />
                       <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Positive Prompt</label>
                       <textarea className="w-full bg-stone-900 border border-stone-800 rounded p-2 text-xs text-stone-300 focus:border-amber-600 focus:outline-none min-h-[60px]" value={editPositivePrompt} onChange={(e) => setEditPositivePrompt(e.target.value)} />
                       <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Style Anchors</label>
                       <textarea className="w-full bg-stone-900 border border-stone-800 rounded p-2 text-xs text-stone-300 focus:border-amber-600 focus:outline-none min-h-[60px]" value={editStyleAnchors} onChange={(e) => setEditStyleAnchors(e.target.value)} />
                    </div>
                    {/* Categorized Pill Selector */}
                    <div className="space-y-3 max-h-80 overflow-y-auto border border-stone-850 bg-stone-950/20 p-3 rounded-xl scrollbar-thin">
                      {Object.entries(VISUAL_TAG_CATEGORIES).map(([category, tags]) => (
                        <div key={category} className="space-y-1.5">
                          <h6 className="text-[8px] font-bold uppercase tracking-widest text-stone-500 font-mono border-b border-stone-900 pb-0.5">
                            {category}
                          </h6>
                          <div className="flex flex-wrap gap-1">
                            {tags.map(tag => {
                              const isSelected = editTags.includes(tag);
                              return (
                                <button
                                  type="button"
                                  key={tag}
                                  onClick={() => {
                                    if (isSelected) {
                                      removeTag(tag);
                                    } else {
                                      setEditTags(prev => [...prev, tag]);
                                    }
                                  }}
                                  className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                    isSelected
                                      ? 'bg-amber-600 text-white border border-amber-500/20 shadow-sm shadow-amber-950/30'
                                      : 'bg-stone-950/60 text-stone-500 hover:text-stone-300 border border-stone-900/60'
                                  }`}
                                >
                                  {tag}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Custom Tags Section */}
                    <div className="bg-stone-950/50 p-3 rounded-xl border border-stone-850/60 space-y-2">
                      <h6 className="text-[9px] font-bold uppercase tracking-widest text-amber-500/80 font-mono">
                        Custom Tags
                      </h6>
                      <div className="flex flex-wrap gap-1">
                        {editTags.filter(t => !ALLOWED_TAGS.includes(t)).map(t => (
                          <span key={t} className="text-[9px] bg-amber-900/20 text-amber-300 px-2 py-0.5 rounded flex items-center gap-1 font-bold border border-amber-900/30">
                            {t}
                            <button type="button" onClick={() => removeTag(t)} className="hover:text-red-400 cursor-pointer">
                              <X size={9} />
                            </button>
                          </span>
                        ))}
                        {editTags.filter(t => !ALLOWED_TAGS.includes(t)).length === 0 && (
                          <span className="text-[9px] text-stone-600 italic">No custom tags</span>
                        )}
                      </div>

                      {/* Add Custom Tag Form */}
                      <div className="flex gap-2 mt-2 pt-2 border-t border-stone-900">
                        <input
                          type="text"
                          placeholder="New custom tag..."
                          value={newTagInput}
                          onChange={(e) => setNewTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addTag();
                            }
                          }}
                          className="flex-1 bg-stone-950 text-stone-300 text-xs border border-stone-800 rounded px-2.5 py-1 focus:outline-none focus:border-amber-600 placeholder-stone-650"
                        />
                        <button
                          type="button"
                          onClick={addTag}
                          className="px-3 py-1 bg-stone-900 hover:bg-stone-800 text-amber-500 border border-stone-800 text-[10px] font-bold uppercase rounded cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold uppercase rounded flex items-center justify-center gap-2 cursor-pointer mt-2"
                    >
                      <Save size={12} /> Save Edits
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(selectedDna.tags || []).map(t => (
                      <span key={t} className="text-[10px] bg-stone-950/80 text-stone-300 px-2.5 py-1 rounded font-bold uppercase tracking-wider border border-stone-800/80">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Deep Inspection profiles (V3 Engine) */}
              {selectedDna.subjectProfile && (
                <div className="space-y-4 border-t border-stone-800/60 pt-4 animate-fade-in">
                  <div>
                    <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                      <Sparkles size={12} className="text-amber-500 animate-pulse" /> Deep Visual DNA Profiles
                    </label>
                    <div className="bg-stone-950/40 rounded-xl border border-amber-900/15 p-4 space-y-4">
                      
                      {/* Subject Profile */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] uppercase tracking-wider bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/20 font-bold font-mono">
                            Subject Profile
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs bg-stone-950/60 p-3 rounded-lg border border-stone-900">
                          <div>
                            <span className="text-[9px] text-stone-500 uppercase tracking-wider font-mono font-bold block mb-0.5">Primary Subject</span>
                            <span className="text-stone-200 font-bold">{selectedDna.subjectProfile.primarySubject}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-stone-500 uppercase tracking-wider font-mono font-bold block mb-0.5">Subject Category</span>
                            <span className="text-stone-200 font-bold capitalize">{selectedDna.subjectProfile.subjectCategory}</span>
                          </div>
                          <div className="col-span-2 border-t border-stone-900/50 pt-2 mt-1">
                            <span className="text-[9px] text-stone-500 uppercase tracking-wider font-mono font-bold block mb-0.5">Visual Role / Dominance</span>
                            <span className="text-amber-400 font-bold capitalize">{selectedDna.subjectProfile.visualRole}</span>
                          </div>
                        </div>
                      </div>

                      {/* Scale Profile */}
                      {selectedDna.scaleProfile && (
                        <div className="space-y-2 border-t border-stone-900/60 pt-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] uppercase tracking-wider bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/20 font-bold font-mono">
                              Scale & Presence
                            </span>
                            {selectedDna.scaleProfile.confidence !== undefined && (
                              <span className="text-[9px] text-stone-500 font-mono">
                                Confiança: <span className="text-amber-500 font-bold">{(selectedDna.scaleProfile.confidence * 100).toFixed(0)}%</span>
                              </span>
                            )}
                          </div>
                          
                          <div className="bg-stone-950/60 p-3 rounded-lg border border-stone-900 space-y-3">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-[9px] text-stone-500 uppercase tracking-wider font-mono block mb-0.5">Physical Scale</span>
                                <span className="text-stone-300 font-bold capitalize">{selectedDna.scaleProfile.physicalScale}</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-stone-500 uppercase tracking-wider font-mono block mb-0.5">Perceived Presence</span>
                                <span className="text-stone-300 font-bold capitalize">{selectedDna.scaleProfile.perceivedPresence}</span>
                              </div>
                            </div>

                            {selectedDna.scaleProfile.scaleForms?.length > 0 && (
                              <div>
                                <span className="text-[9px] text-stone-500 uppercase tracking-wider font-mono block mb-1">Scale Forms</span>
                                <div className="flex flex-wrap gap-1">
                                  {selectedDna.scaleProfile.scaleForms.map((sf, i) => (
                                    <span key={i} className="text-[9px] bg-stone-900 text-stone-400 border border-stone-850 px-1.5 py-0.5 rounded font-medium">
                                      {sf}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {selectedDna.scaleProfile.scaleCues?.length > 0 && (
                              <div>
                                <span className="text-[9px] text-stone-500 uppercase tracking-wider font-mono block mb-1">Compositional Cues</span>
                                <div className="flex flex-wrap gap-1">
                                  {selectedDna.scaleProfile.scaleCues.map((sc, i) => (
                                    <span key={i} className="text-[9px] bg-stone-900 text-stone-400 border border-stone-850 px-1.5 py-0.5 rounded font-medium">
                                      {sc}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {selectedDna.scaleProfile.evidence && (
                              <div className="border-t border-stone-900/60 pt-2 text-[11px] text-stone-400 leading-normal italic">
                                "{selectedDna.scaleProfile.evidence}"
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Substance Profile */}
                      {selectedDna.substanceProfile && (
                        <div className="space-y-2 border-t border-stone-900/60 pt-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] uppercase tracking-wider bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/20 font-bold font-mono">
                              Substance & Elements
                            </span>
                            {selectedDna.substanceProfile.confidence !== undefined && (
                              <span className="text-[9px] text-stone-500 font-mono">
                                Confiança: <span className="text-amber-500 font-bold">{(selectedDna.substanceProfile.confidence * 100).toFixed(0)}%</span>
                              </span>
                            )}
                          </div>

                          <div className="bg-stone-950/60 p-3 rounded-lg border border-stone-900 space-y-3">
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              {selectedDna.substanceProfile.materials?.length > 0 && (
                                <div className="col-span-1">
                                  <span className="text-[9px] text-stone-500 uppercase tracking-wider font-mono block mb-1">Materials</span>
                                  <div className="flex flex-wrap gap-1">
                                    {selectedDna.substanceProfile.materials.map((m, i) => (
                                      <span key={i} className="text-[9px] bg-stone-900 text-stone-350 border border-stone-850 px-1.5 py-0.5 rounded font-semibold capitalize">
                                        {m}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {selectedDna.substanceProfile.surfaces?.length > 0 && (
                                <div className="col-span-1">
                                  <span className="text-[9px] text-stone-500 uppercase tracking-wider font-mono block mb-1">Surface Finish</span>
                                  <div className="flex flex-wrap gap-1">
                                    {selectedDna.substanceProfile.surfaces.map((s, i) => (
                                      <span key={i} className="text-[9px] bg-stone-900 text-stone-400 border border-stone-850 px-1.5 py-0.5 rounded font-medium capitalize">
                                        {s}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {selectedDna.substanceProfile.elements?.length > 0 && (
                                <div className="col-span-1 border-t border-stone-900/50 pt-2">
                                  <span className="text-[9px] text-stone-500 uppercase tracking-wider font-mono block mb-1">Elements</span>
                                  <div className="flex flex-wrap gap-1">
                                    {selectedDna.substanceProfile.elements.map((e, i) => (
                                      <span key={i} className="text-[9px] bg-amber-950/55 text-amber-400 border border-amber-900/25 px-1.5 py-0.5 rounded font-bold capitalize font-mono">
                                        {e}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {selectedDna.substanceProfile.elementApplications?.length > 0 && (
                                <div className="col-span-1 border-t border-stone-900/50 pt-2">
                                  <span className="text-[9px] text-stone-500 uppercase tracking-wider font-mono block mb-1">Application</span>
                                  <div className="flex flex-wrap gap-1">
                                    {selectedDna.substanceProfile.elementApplications.map((ea, i) => (
                                      <span key={i} className="text-[9px] bg-stone-900 text-stone-400 border border-stone-850 px-1.5 py-0.5 rounded font-medium">
                                        {ea}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {selectedDna.substanceProfile.evidence && (
                              <div className="border-t border-stone-900/60 pt-2 text-[11px] text-stone-400 leading-normal italic">
                                "{selectedDna.substanceProfile.evidence}"
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                </div>
              )}

              {/* Radar/Bar Utility Scores */}
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                  <BarChart3 size={12} /> Utility Matrix
                </label>
                <div className="bg-stone-950/40 rounded-xl border border-stone-800 p-4 space-y-2.5">
                  {Object.entries(selectedDna.scores || {}).map(([key, score]) => (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-[9px] uppercase tracking-wider font-bold">
                        <span className="text-stone-400">{key === 'rendering' ? 'renderização' : key === 'palette' ? 'paleta' : key === 'details' ? 'detalhes' : key === 'effects' ? 'efeitos' : key === 'materials' ? 'materiais' : key === 'lighting' ? 'iluminação' : key === 'composition' ? 'composição' : key}</span>
                        <span className="text-amber-500">{((score as number) * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-stone-900 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-amber-800 to-amber-500 rounded-full" style={{ width: `${(score as number) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* DNA Attribute Details Breakdown */}
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                  <FileText size={12} /> Core Characteristics
                </label>
                <div className="space-y-4">
                  {[
                    { label: "Linework / Traço", val: selectedDna.linework },
                    { label: "Rendering / Render", val: selectedDna.rendering },
                    { label: "Palette / Paleta", val: selectedDna.palette },
                    { label: "Silhouette / Silhueta", val: selectedDna.silhouette },
                    { label: "Pose & Motion", val: selectedDna.pose },
                    { label: "Camera / Framing", val: selectedDna.framing },
                    { label: "Composition", val: selectedDna.composition },
                    { label: "Lighting", val: selectedDna.lighting },
                    { label: "Effects & Particles", val: selectedDna.effects },
                    { label: "Materials / Textures", val: selectedDna.materials },
                    { label: "Detail Density", val: selectedDna.details },
                    { label: "Background", val: selectedDna.background },
                    { label: "Hierarchy / Foco", val: selectedDna.hierarchy },
                    ...(selectedDna.visualMotifs ? [{ label: "Visual Motifs (Advanced)", val: selectedDna.visualMotifs }] : []),
                    ...(selectedDna.shapeLanguage ? [{ label: "Shape Language (Advanced)", val: selectedDna.shapeLanguage }] : []),
                    ...(selectedDna.focalAnchors ? [{ label: "Focal Anchors (Advanced)", val: selectedDna.focalAnchors }] : []),
                    ...(selectedDna.detailPlacement ? [{ label: "Detail Placement (Advanced)", val: selectedDna.detailPlacement }] : []),
                    ...(selectedDna.compositionRecipe ? [{ label: "Composition Recipe (Advanced)", val: selectedDna.compositionRecipe }] : []),
                    ...(selectedDna.paletteLogic ? [{ label: "Palette Logic (Advanced)", val: selectedDna.paletteLogic }] : []),
                    ...(selectedDna.materialBehavior ? [{ label: "Material Behavior (Advanced)", val: selectedDna.materialBehavior }] : []),
                    ...(selectedDna.energyDesign ? [{ label: "Energy Design (Advanced)", val: selectedDna.energyDesign }] : []),
                    ...(selectedDna.styleAnchors ? [{ label: "Style Anchors (Advanced)", val: selectedDna.styleAnchors }] : []),
                    ...(selectedDna.avoidRules ? [{ label: "Avoid Rules (Advanced)", val: selectedDna.avoidRules }] : []),
                  ].map((attr, idx) => (
                    <div key={idx} className="border-l border-stone-800 pl-3">
                      <h5 className="text-[10px] font-bold uppercase tracking-widest text-amber-500/80 mb-0.5">{attr.label}</h5>
                      <p className="text-xs text-stone-300 leading-relaxed">{attr.val}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Prompt Fragments */}
              <div className="space-y-4 border-t border-stone-800 pt-4">
                <div>
                  <h5 className="text-[10px] font-bold uppercase tracking-widest text-green-400 flex items-center gap-1.5 mb-1.5">
                    <Check size={12} /> Positive Prompt Fragments
                  </h5>
                  <p className="text-xs text-stone-400 font-mono bg-stone-950/60 p-2.5 rounded border border-stone-900 leading-relaxed">
                    {selectedDna.positivePrompt || "None extracted."}
                  </p>
                </div>
                <div>
                  <h5 className="text-[10px] font-bold uppercase tracking-widest text-red-400 flex items-center gap-1.5 mb-1.5">
                    <X size={12} /> Negative Prompt Fragments
                  </h5>
                  <p className="text-xs text-stone-400 font-mono bg-stone-950/60 p-2.5 rounded border border-stone-900 leading-relaxed">
                    {selectedDna.negativePrompt || "None extracted."}
                  </p>
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div className="bg-stone-900/20 border border-dashed border-stone-800 rounded-2xl p-10 py-20 text-center text-stone-500">
            <ImageIcon className="mx-auto text-stone-700 mb-3" size={24} />
            <h4 className="text-xs font-bold uppercase tracking-widest mb-1">No DNA matrix active</h4>
            <p className="text-[11px] text-stone-600 italic">Select any visual memory to parse its stylistic coordinates.</p>
          </div>
        )}
      </div>

    </div>
  );
};

export default ArtstyleDatabase;
