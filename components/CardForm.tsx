import React, { useState, useEffect } from 'react';
import { Archetype, CardGenerationRequest, CardType, Complexity, Context, ImageModel, VisualDNA } from '../types';
import { getLocalDNA } from '../services/localDbService';
import { compressImage } from '../services/imageUtils';
import { Wand2, Sparkles, Box, Ghost, Zap, Gauge, Crown, Upload, X, Database, Sliders, CheckSquare, Square } from 'lucide-react';

interface CardFormProps {
  onSubmit: (request: CardGenerationRequest) => void;
  isLoading: boolean;
  hasApiKey: boolean;
  onRequestKey: () => void;
}

const CardForm: React.FC<CardFormProps> = ({ onSubmit, isLoading, hasApiKey, onRequestKey }) => {
  const [subject, setSubject] = useState(() => localStorage.getItem('grimoire_subject') || '');
  const [cardType, setCardType] = useState<CardType>(() => (localStorage.getItem('grimoire_cardType') as CardType) || CardType.Monster);
  const [complexity, setComplexity] = useState<Complexity>(() => (localStorage.getItem('grimoire_complexity') as Complexity) || Complexity.Medium);
  const [context, setContext] = useState<Context>(Context.Character);
  const [archetype, setArchetype] = useState<Archetype>(() => (localStorage.getItem('grimoire_archetype') as Archetype) || Archetype.Generic);
  const [model, setModel] = useState<ImageModel>(() => (localStorage.getItem('grimoire_model') as ImageModel) || ImageModel.Lite); // Default to Lite for free/easy access
  const [referenceImage, setReferenceImage] = useState<string | undefined>();
  
  // Save selections to localStorage to prevent state loss when switching tabs/screens
  useEffect(() => {
    localStorage.setItem('grimoire_subject', subject);
  }, [subject]);

  useEffect(() => {
    localStorage.setItem('grimoire_cardType', cardType);
  }, [cardType]);

  useEffect(() => {
    localStorage.setItem('grimoire_complexity', complexity);
  }, [complexity]);

  useEffect(() => {
    localStorage.setItem('grimoire_archetype', archetype);
  }, [archetype]);

  useEffect(() => {
    localStorage.setItem('grimoire_model', model);
  }, [model]);
  
  // Artstyle Database Integration States
  const [useVisualDB, setUseVisualDB] = useState(true);
  const [isCompressing, setIsCompressing] = useState(false);
  const [dbIntensity, setDbIntensity] = useState<'low' | 'medium' | 'high'>('medium');
  const [dbMaxReferences, setDbMaxReferences] = useState(3);
  const [dbAutoSelect, setDbAutoSelect] = useState(true);
  const [dbManualReferenceIds, setDbManualReferenceIds] = useState<string[]>([]);
  const [dnaList, setDnaList] = useState<VisualDNA[]>([]);
  const [dbExpanded, setDbExpanded] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadDna = async () => {
      try {
        const list = await getLocalDNA();
        setDnaList(list);
      } catch (err) {
        console.error("Failed to load DNA list in CardForm", err);
      }
    };
    loadDna();
  }, [isLoading, useVisualDB]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim()) {
      onSubmit({ 
        subject, 
        cardType, 
        complexity, 
        context, 
        archetype, 
        model, 
        referenceImage,
        useVisualDB,
        dbIntensity,
        dbMaxReferences,
        dbAutoSelect,
        dbManualReferenceIds
      });
    }
  };

  const handleProSelection = () => {
    setModel(ImageModel.Pro);
    if (!hasApiKey) {
        onRequestKey();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      const compressedDataUrl = await compressImage(file, 1536, 1536, 0.85);
      setReferenceImage(compressedDataUrl);
    } catch (err) {
      console.error("Failed to compress image:", err);
      clearReferenceImage();
    } finally {
      setIsCompressing(false);
    }
  };

  const clearReferenceImage = () => {
    setReferenceImage(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleManualId = (id: string) => {
    setDbManualReferenceIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 w-full max-w-lg">
      
      {/* Subject Input */}
      <div className="space-y-2">
        <label className="text-stone-400 text-xs font-bold tracking-widest uppercase">Subject Description</label>
        <textarea
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g., An armored skeleton warrior wielding a jagged obsidian sword in a foggy graveyard..."
          className="w-full h-32 bg-stone-900 border border-stone-700 rounded-lg p-4 text-stone-200 placeholder-stone-600 focus:border-amber-600 focus:ring-1 focus:ring-amber-600 outline-none resize-none transition-all"
          required
        />
      </div>

      {/* Reference Image Input */}
      <div className="space-y-2">
        <label className="text-stone-400 text-xs font-bold tracking-widest uppercase flex items-center gap-2">
          Reference Image <span className="text-[10px] font-normal text-stone-600 normal-case">(Optional - guides composition/colors)</span>
        </label>
        {referenceImage ? (
          <div className="relative w-full h-32 rounded-lg border border-stone-700 overflow-hidden group">
            <img src={referenceImage} alt="Reference" className="w-full h-full object-cover" />
            <button 
              type="button" 
              onClick={clearReferenceImage}
              className="absolute top-2 right-2 bg-stone-900/80 p-1.5 rounded-md text-stone-300 hover:text-red-400 hover:bg-stone-900 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ) : isCompressing ? (
          <div className="w-full h-24 border-2 border-dashed border-stone-700 rounded-lg flex flex-col items-center justify-center text-stone-500 bg-stone-900/30">
            <div className="w-5 h-5 border-2 border-stone-500 border-t-amber-500 rounded-full animate-spin mb-2" />
            <span className="text-xs font-medium">Compressing...</span>
          </div>
        ) : (
          <div 
            onClick={() => !isCompressing && fileInputRef.current?.click()}
            className="w-full h-24 border-2 border-dashed border-stone-700 rounded-lg flex flex-col items-center justify-center text-stone-500 hover:border-amber-600 hover:text-amber-500 hover:bg-stone-900/50 cursor-pointer transition-all"
          >
            <Upload size={20} className="mb-2" />
            <span className="text-xs font-medium">Click to upload an image</span>
          </div>
        )}
        <input
          type="file" 
          ref={fileInputRef} 
          onChange={handleImageUpload} 
          accept="image/*" 
          className="hidden" 
        />
      </div>

      {/* Model Selection */}
      <div className="space-y-2">
        <label className="text-stone-400 text-xs font-bold tracking-widest uppercase flex items-center gap-2">
            Forge Model <span className="text-[10px] font-normal text-stone-600 normal-case">(Choose speed or quality)</span>
        </label>
        <div className="grid grid-cols-3 gap-3">
            <button
                type="button"
                onClick={handleProSelection}
                className={`relative p-3 rounded-lg border flex flex-col items-center gap-1 transition-all ${
                    model === ImageModel.Pro 
                    ? 'bg-stone-800 border-amber-600 text-amber-100 shadow-lg shadow-amber-900/20' 
                    : 'bg-stone-900 border-stone-700 text-stone-500 hover:border-stone-500'
                }`}
            >
                <div className="flex items-center gap-2 mb-1">
                    <Crown size={14} className={model === ImageModel.Pro ? "text-amber-500" : ""} />
                    <span className="text-[10px] font-bold uppercase">Pro (Paid)</span>
                </div>
                <span className="text-[9px] opacity-60">Gemini 3 Pro</span>
            </button>

            <button
                type="button"
                onClick={() => setModel(ImageModel.Flash)}
                className={`relative p-3 rounded-lg border flex flex-col items-center gap-1 transition-all ${
                    model === ImageModel.Flash
                    ? 'bg-stone-800 border-amber-600 text-amber-100 shadow-lg shadow-amber-900/20' 
                    : 'bg-stone-900 border-stone-700 text-stone-500 hover:border-stone-500'
                }`}
            >
                <div className="flex items-center gap-2 mb-1">
                    <Gauge size={14} className={model === ImageModel.Flash ? "text-amber-500" : ""} />
                    <span className="text-[10px] font-bold uppercase">Flash (Paid)</span>
                </div>
                <span className="text-[9px] opacity-60">Gemini 3.1 Flash</span>
            </button>
            
            <button
                type="button"
                onClick={() => setModel(ImageModel.Lite)}
                className={`relative p-3 rounded-lg border flex flex-col items-center gap-1 transition-all ${
                    model === ImageModel.Lite
                    ? 'bg-stone-800 border-green-600 text-green-100 shadow-lg shadow-green-900/20' 
                    : 'bg-stone-900 border-stone-700 text-stone-500 hover:border-stone-500'
                }`}
            >
                <div className="flex items-center gap-2 mb-1">
                    <Sparkles size={14} className={model === ImageModel.Lite ? "text-green-500" : ""} />
                    <span className="text-[10px] font-bold uppercase">Lite (Free)</span>
                </div>
                <span className="text-[9px] opacity-60">Gemini 3.1 Flash Lite</span>
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card Type */}
        <div className="space-y-2">
          <label className="text-stone-400 text-xs font-bold tracking-widest uppercase">Card Type</label>
          <div className="flex gap-2">
            {[CardType.Monster, CardType.Spell, CardType.Trap].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setCardType(type)}
                className={`flex-1 py-2 text-xs font-bold uppercase rounded border transition-all ${
                  cardType === type
                    ? 'bg-stone-200 text-stone-900 border-stone-200'
                    : 'bg-stone-800 text-stone-500 border-stone-700 hover:border-stone-500'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Complexity */}
        <div className="space-y-2">
          <label className="text-stone-400 text-xs font-bold tracking-widest uppercase">Complexity</label>
          <select
            value={complexity}
            onChange={(e) => setComplexity(e.target.value as Complexity)}
            className="w-full bg-stone-900 border border-stone-700 rounded px-3 py-2 text-stone-200 text-sm focus:border-amber-600 outline-none"
          >
            {Object.values(Complexity).map((c) => (
              <option key={c} value={c}>{c} Detail</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Context */}
        <div className="space-y-2">
          <label className="text-stone-400 text-xs font-bold tracking-widest uppercase">Context Focus</label>
          <div className="grid grid-cols-3 gap-2">
             <button type="button" onClick={() => setContext(Context.Character)} className={`flex flex-col items-center justify-center p-2 rounded border ${context === Context.Character ? 'border-amber-500 bg-amber-900/20 text-amber-200' : 'border-stone-700 text-stone-500 hover:bg-stone-800'}`}>
                <Ghost size={16} className="mb-1" />
                <span className="text-[10px]">Char</span>
             </button>
             <button type="button" onClick={() => setContext(Context.Object)} className={`flex flex-col items-center justify-center p-2 rounded border ${context === Context.Object ? 'border-amber-500 bg-amber-900/20 text-amber-200' : 'border-stone-700 text-stone-500 hover:bg-stone-800'}`}>
                <Box size={16} className="mb-1" />
                <span className="text-[10px]">Obj</span>
             </button>
             <button type="button" onClick={() => setContext(Context.Scenario)} className={`flex flex-col items-center justify-center p-2 rounded border ${context === Context.Scenario ? 'border-amber-500 bg-amber-900/20 text-amber-200' : 'border-stone-700 text-stone-500 hover:bg-stone-800'}`}>
                <Zap size={16} className="mb-1" />
                <span className="text-[10px]">Scene</span>
             </button>
          </div>
        </div>

        {/* Archetype */}
        <div className="space-y-2">
          <label className="text-stone-400 text-xs font-bold tracking-widest uppercase">Archetype</label>
          <select
            value={archetype}
            onChange={(e) => setArchetype(e.target.value as Archetype)}
            className="w-full bg-stone-900 border border-stone-700 rounded px-3 py-2 text-stone-200 text-sm focus:border-amber-600 outline-none"
          >
            {Object.values(Archetype).map((arch) => (
              <option key={arch} value={arch}>{arch}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Artstyle Database Integration Section */}
      <div className="bg-stone-900/40 border border-stone-800/80 rounded-xl p-4 mt-2 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database size={16} className={useVisualDB ? "text-amber-500 animate-pulse" : "text-stone-600"} />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-300">Global Artstyle DNA DB</h4>
              <p className="text-[10px] text-stone-500">Inject reference memories into prompt</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUseVisualDB(!useVisualDB)}
            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all border ${
              useVisualDB 
                ? 'bg-amber-600/15 border-amber-600/40 text-amber-300' 
                : 'bg-stone-950 text-stone-500 border-stone-800'
            }`}
          >
            {useVisualDB ? "Enabled" : "Disabled"}
          </button>
        </div>

        {useVisualDB && (
          <div className="space-y-4 pt-3 border-t border-stone-800/60 transition-all duration-300">
            {/* DNA Intensity */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex justify-between">
                <span>DNA Influence Intensity</span>
                <span className="text-amber-500 font-sans">{dbIntensity.toUpperCase()}</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5 bg-stone-950 p-1 rounded-lg border border-stone-900">
                {(['low', 'medium', 'high'] as const).map((intensity) => (
                  <button
                    key={intensity}
                    type="button"
                    onClick={() => setDbIntensity(intensity)}
                    className={`py-1 text-[9px] font-bold uppercase tracking-wider rounded transition-all ${
                      dbIntensity === intensity
                        ? 'bg-amber-600 text-white shadow shadow-amber-950/45'
                        : 'text-stone-500 hover:text-stone-300'
                    }`}
                  >
                    {intensity}
                  </button>
                ))}
              </div>
            </div>

            {/* Max references & Mode */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                  Max DNA Sources
                </label>
                <select
                  value={dbMaxReferences}
                  onChange={(e) => setDbMaxReferences(Number(e.target.value))}
                  className="w-full bg-stone-950 border border-stone-850 rounded px-2 py-1.5 text-[11px] font-bold text-stone-300 focus:outline-none"
                >
                  {[1, 2, 3, 4, 5].map(num => (
                    <option key={num} value={num}>{num} {num === 1 ? 'Reference' : 'References'}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                  Retrieval Mode
                </label>
                <div className="grid grid-cols-2 gap-1 bg-stone-950 p-0.5 rounded border border-stone-850">
                  <button
                    type="button"
                    onClick={() => setDbAutoSelect(true)}
                    className={`py-1 text-[9px] font-bold uppercase rounded ${dbAutoSelect ? 'bg-stone-800 text-amber-400' : 'text-stone-500'}`}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => setDbAutoSelect(false)}
                    className={`py-1 text-[9px] font-bold uppercase rounded ${!dbAutoSelect ? 'bg-stone-800 text-amber-400' : 'text-stone-500'}`}
                  >
                    Manual
                  </button>
                </div>
              </div>
            </div>

            {/* Selection Status or Grid */}
            {dbAutoSelect ? (
              <p className="text-[10px] text-stone-500 italic leading-relaxed bg-stone-950/40 p-2.5 rounded border border-stone-900">
                💡 The core engine will read your subject prompt and archetype, query the local database, and auto-synthesize the most stylistic compatible DNA blueprint tags.
              </p>
            ) : (
              <div>
                {dnaList.length === 0 ? (
                  <p className="text-[10px] text-stone-600 italic">No DNA references found in local database. Add some first.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                    {dnaList.map(dna => {
                      const isSelected = dbManualReferenceIds.includes(dna.id);
                      return (
                        <div 
                          key={dna.id}
                          onClick={() => toggleManualId(dna.id)}
                          className={`group relative aspect-square cursor-pointer rounded-md overflow-hidden border transition-all ${
                            isSelected 
                              ? 'border-amber-600 ring-1 ring-amber-600/30' 
                              : 'border-stone-850 opacity-65 hover:opacity-100'
                          }`}
                        >
                          <img src={dna.imageUrl} alt={dna.name} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-stone-950/30 group-hover:bg-transparent transition-all" />
                          <div className="absolute top-1 left-1">
                            {isSelected ? (
                              <CheckSquare size={12} className="text-amber-500 fill-stone-950" />
                            ) : (
                              <Square size={12} className="text-stone-500/50" />
                            )}
                          </div>
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-950/80 to-transparent p-1">
                            <p className="text-[8px] font-bold text-stone-300 truncate">{dna.name}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading || !subject.trim()}
        className={`mt-4 w-full py-4 rounded-lg font-bold tracking-widest uppercase flex items-center justify-center gap-2 transition-all ${
          isLoading || !subject.trim()
            ? 'bg-stone-800 text-stone-600 cursor-not-allowed'
            : 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/50'
        }`}
      >
        {isLoading ? (
          <>
            <Sparkles className="animate-spin" size={18} />
            Forging...
          </>
        ) : (
          <>
            <Wand2 size={18} />
            Manifest Card
          </>
        )}
      </button>

    </form>
  );
};

export default CardForm;
