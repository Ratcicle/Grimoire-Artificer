import React, { useEffect, useState, useRef } from 'react';
import { CardGenerationRequest, GeneratedCard } from './types';
import { checkApiKey, promptApiKeySelection, disconnectApiKey, resolveAccessPolicy, validateModelAccess, type AccessPolicyState } from './services/geminiService';
import { imageExtension } from './services/imagePreparation';
import { runGeneration } from './services/aiOperations';
import CardForm from './components/CardForm';
import CardFrame from './components/CardFrame';
const ArtstyleDatabase = React.lazy(() => import('./components/ArtstyleDatabase'));
const TokenMonitor = React.lazy(() => import('./components/TokenMonitor'));
import { History, Plus, AlertCircle, Download, Key, Sparkles, Database, BarChart3 } from 'lucide-react';

const App: React.FC = () => {
  const [accessPolicy, setAccessPolicy] = useState<AccessPolicyState>({
    mode: 'unavailable',
    label: 'Acesso indisponível',
    hasPersonalKey: false
  });
  const [apiKeySet, setApiKeySet] = useState<boolean>(false);
  const [checkingKey, setCheckingKey] = useState<boolean>(true);
  const [showKeyDropdown, setShowKeyDropdown] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentCard, setCurrentCard] = useState<GeneratedCard | null>(null);
  const [history, setHistory] = useState<GeneratedCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<'grimoire' | 'database' | 'tokenMonitor'>('grimoire');

  useEffect(() => {
    verifyKey();
  }, []);

  const verifyKey = async () => {
    setCheckingKey(true);
    try {
      const policy = typeof resolveAccessPolicy === 'function'
        ? await resolveAccessPolicy()
        : {
            mode: (await checkApiKey()) ? 'local_server' : 'unavailable',
            label: (await checkApiKey()) ? 'Servidor local configurado' : 'Acesso indisponível',
            hasPersonalKey: await checkApiKey(),
          };
      setAccessPolicy(policy);
      setApiKeySet(policy.hasPersonalKey || policy.mode === 'local_server');
    } catch (e) {
      console.error("Failed to check access policy", e);
    } finally {
      setCheckingKey(false);
    }
  };

  const handleConnect = async () => {
    try {
      await promptApiKeySelection();
      await verifyKey();
      setError(null);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to connect API key.");
    }
  };

  const generationRef = useRef(false);
  const [databaseVisited, setDatabaseVisited] = useState(false);
  useEffect(() => { if (currentTab === 'database') setDatabaseVisited(true); }, [currentTab]);

  const handleGenerate = async (request: CardGenerationRequest) => {
    if (generationRef.current) return;
    generationRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const policy = typeof resolveAccessPolicy === 'function' ? await resolveAccessPolicy() : null;
      if (policy) {
        const check = validateModelAccess(policy.mode, request.model);
        if (!check.allowed) {
          throw new Error(check.reason || 'Modelo não permitido para a política de acesso atual.');
        }
      } else if (!await checkApiKey()) {
        throw new Error('Configure uma chave no servidor local ou conecte a chave no AI Studio.');
      }
      const outcome = await runGeneration(request);
      if (outcome.status === 'busy') return;
      if (outcome.status === 'failed') throw new Error(outcome.error);
      const result = outcome.result;
      const newCard: GeneratedCard = {
        id: crypto.randomUUID(), imageUrl: result.imageUrl, request, timestamp: Date.now(), visualDbStatus: result.visualDbStatus,
        injectedPromptBlock: result.injectedPromptBlock, usedReferences: result.usedReferences,
        selectedReferences: result.selectedReferences || result.usedReferences,
        contributingReferences: result.contributingReferences || [],
        autoSelectScores: result.autoSelectScores, synthDebug: result.synthDebug
      };
      setCurrentCard(newCard);
      setHistory(prev => [newCard, ...prev]);
      if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      generationRef.current = false;
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!currentCard) return;
    const link = document.createElement('a');
    link.href = currentCard.imageUrl;
    const safeSubject = currentCard.request.subject
        .slice(0, 30)
        .replace(/[^a-z0-9]/gi, '-')
        .toLowerCase();
    link.download = `shadow-duel-${safeSubject}-${Date.now()}.${imageExtension(currentCard.imageUrl)}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (checkingKey) {
    return <div className="h-screen bg-stone-950 flex items-center justify-center text-stone-500 animate-pulse uppercase tracking-widest text-sm">Initializing Grimoire...</div>;
  }

  return (
    <div className="flex h-screen bg-stone-950 text-stone-200 overflow-hidden">
      
      {/* Sidebar History */}
      {currentTab === 'grimoire' && (
        <aside className="hidden lg:flex flex-col w-60 xl:w-64 border-r border-stone-800 bg-stone-900/40 overflow-y-auto">
          <div className="p-6 border-b border-stone-800 sticky top-0 bg-stone-950/95 backdrop-blur z-10 flex items-center gap-2">
              <History size={18} className="text-stone-500" />
              <h2 className="font-bold tracking-widest text-[10px] text-stone-400 uppercase">Archive</h2>
          </div>
          <div className="p-4 space-y-3">
              {history.length === 0 && (
                  <div className="text-stone-600 text-xs text-center italic py-10">No artifacts created yet.</div>
  
              )}
              {history.map(card => (
                  <div 
                      key={card.id} 
                      onClick={() => {
                        setCurrentCard(card);
                        setCurrentTab('grimoire');
                        if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`group cursor-pointer p-2.5 rounded-lg border transition-all ${currentCard?.id === card.id ? 'bg-stone-800 border-amber-900/50 ring-1 ring-amber-900/20' : 'border-stone-800/60 hover:border-stone-600 bg-stone-900/30'}`}
                  >
                      <div className="flex gap-3">
                          <img src={card.imageUrl} alt="thumbnail" className="w-10 h-14 object-cover rounded bg-black flex-shrink-0" />
                          <div className="overflow-hidden flex flex-col justify-center">
                              <p className="text-[11px] font-bold text-stone-300 truncate">{card.request.subject}</p>
                              <p className="text-[9px] text-stone-500 mt-0.5 uppercase tracking-wider">{card.request.cardType} • {card.request.archetype.split(' ')[0]}</p>
                          </div>
                      </div>
                  </div>
              ))}
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative overflow-y-auto overflow-x-hidden">
        <header className="px-4 py-4 lg:px-8 lg:py-6 border-b border-stone-800 flex justify-between items-center bg-stone-950/80 backdrop-blur sticky top-0 z-20">
            <div className="flex items-center gap-3">
                <div className="w-7 h-7 bg-amber-700 rounded-lg flex items-center justify-center transform rotate-3 shadow-lg shadow-amber-900/20">
                    <span className="font-serif font-bold text-base text-black">G</span>
                </div>
                <h1 className="text-lg lg:text-xl font-serif tracking-wide text-stone-200">Grimoire Artificer</h1>
            </div>
            
            <div className="flex items-center gap-3 lg:gap-4">
                <div className="relative">
                    <button
                        onClick={() => {
                            if (apiKeySet) {
                                setShowKeyDropdown(!showKeyDropdown);
                            } else {
                                handleConnect();
                            }
                        }}
                        title={
                            apiKeySet
                            ? "API Key Connected"
                            : accessPolicy.mode === 'aistudio_default'
                            ? "Acesso padrão do AI Studio"
                            : "Connect API Key"
                        }
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${
                            apiKeySet 
                            ? 'bg-green-900/10 text-green-400 border-green-900/40 hover:bg-green-900/20' 
                            : accessPolicy.mode === 'aistudio_default'
                            ? 'bg-amber-900/15 text-amber-300 border-amber-800/50 hover:bg-amber-900/25'
                            : 'bg-stone-800 text-stone-400 border-stone-700 hover:text-amber-500 hover:border-amber-600'
                        }`}
                    >
                        <Key size={12} />
                        <span className="hidden sm:inline">
                            {apiKeySet 
                                ? (accessPolicy.mode === 'local_server' ? "Servidor Local" : "Chave Pessoal")
                                : (accessPolicy.mode === 'aistudio_default' ? "Padrão AI Studio" : "Conectar Chave")
                            }
                        </span>
                        <span className="sm:hidden">
                            {apiKeySet ? "OK" : accessPolicy.mode === 'aistudio_default' ? "Padrão" : "Key"}
                        </span>
                    </button>
                    {showKeyDropdown && apiKeySet && (
                        <div className="absolute top-full right-0 mt-2 w-44 bg-stone-900 border border-stone-800 rounded-lg shadow-xl overflow-hidden z-50">
                            <div className="px-3 py-1.5 text-[9px] text-stone-400 border-b border-stone-800 uppercase font-mono">
                                {accessPolicy.label}
                            </div>
                            <button
                                onClick={async () => {
                                    await disconnectApiKey();
                                    await verifyKey();
                                    setShowKeyDropdown(false);
                                }}
                                className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-stone-800 transition-colors"
                            >
                                Desconectar
                            </button>
                        </div>
                    )}
        
                </div>

                <button 
                    onClick={() => {
                        setCurrentCard(null);
                        setCurrentTab('grimoire');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="lg:hidden p-1.5 text-stone-400 hover:text-white bg-stone-900 rounded-md border border-stone-800"
                >
                    <Plus size={18} />
                </button>
            </div>
        </header>

        <div className="flex-1 p-4 lg:p-8 xl:p-12 max-w-7xl mx-auto w-full flex flex-col">
            
            {/* Global navigation tabs replacing the original subtitle block */}
            <div className="mb-8 flex justify-center lg:justify-start gap-3 border-b border-stone-900 pb-5">
                <button
                  onClick={() => setCurrentTab('grimoire')}
                  className={`px-5 py-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest rounded-lg border transition-all ${
                    currentTab === 'grimoire'
                      ? 'bg-amber-600 border-amber-600 text-white shadow-lg shadow-amber-950/20 font-semibold'
                      : 'bg-stone-900/50 border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Sparkles size={12} />
                  Grimoire
                </button>
                <button
                  onClick={() => setCurrentTab('database')}
                  className={`px-5 py-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest rounded-lg border transition-all ${
                    currentTab === 'database'
                      ? 'bg-amber-600 border-amber-600 text-white shadow-lg shadow-amber-950/20 font-semibold'
                      : 'bg-stone-900/50 border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Database size={12} />
                  Artstyle Database
                </button>
                <button
                  onClick={() => setCurrentTab('tokenMonitor')}
                  className={`px-5 py-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest rounded-lg border transition-all ${
                    currentTab === 'tokenMonitor'
                      ? 'bg-amber-600 border-amber-600 text-white shadow-lg shadow-amber-950/20 font-semibold'
                      : 'bg-stone-900/50 border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <BarChart3 size={12} />
                  Token Monitor
                </button>
            </div>

            <div className={currentTab === 'grimoire' ? 'block' : 'hidden'}>
              <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-center lg:items-start justify-center">
                  
                  {/* Display Section (First on mobile) */}
                  <section className="w-full lg:w-auto flex flex-col items-center justify-center order-1 lg:order-2 lg:sticky lg:top-24">
                       <CardFrame 
                          imageUrl={currentCard?.imageUrl} 
                          loading={isLoading} 
                          type={currentCard?.request.cardType}
                       />
                       {currentCard && (
                          <div className="mt-6 flex flex-col items-center gap-4 w-full">
                              <div className="text-center max-w-[280px] sm:max-w-sm">
                                  <p className="text-stone-500 text-[10px] uppercase tracking-widest mb-2 font-bold">Current Essence</p>
                                  <p className="text-stone-300 text-sm italic line-clamp-2">"{currentCard.request.subject}"</p>
                              </div>
                              
                              <button 
                                  onClick={handleDownload}
                                  className="flex items-center gap-2 px-6 py-2.5 rounded-full border border-stone-700 bg-stone-900 text-stone-300 hover:bg-stone-800 hover:text-white hover:border-stone-500 transition-all text-xs font-bold tracking-widest group shadow-xl"
                              >
                                  <Download size={14} className="group-hover:text-amber-500 transition-colors" />
                                  DOWNLOAD ARTIFACT
                              </button>

                              {/* DNA retrieved panel */}
                              {currentCard.visualDbStatus && (
                                <p className="text-xs text-stone-400" role="status">
                                  {{disabled:'Artstyle Database desativada.',empty:'Biblioteca vazia; nenhuma referência usada.',
                                    'no-selection':'Nenhuma referência selecionada.',filtered:'Referências selecionadas; contribuições filtradas por compatibilidade.',
                                    contributing:'Artstyle Database aplicada à geração.'}[currentCard.visualDbStatus]}
                                </p>
                              )}
                              {((currentCard.usedReferences && currentCard.usedReferences.length > 0) || currentCard.synthDebug) && (
                                <div className="mt-4 p-4 bg-stone-900/30 rounded-xl border border-stone-800 w-full max-w-sm text-left">
                                  <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                    <Database size={11} />
                                    Injected Visual DNA
                                  </p>
                                  <div className="flex flex-wrap gap-1 mb-3">
                                    {(() => {
                                      const selectedRefs = currentCard.selectedReferences || currentCard.usedReferences || [];
                                      const contributingIds = new Set((currentCard.contributingReferences || []).map(r => r.id));
                                      if (selectedRefs.length === 0) {
                                        return (
                                          <span className="text-[9px] bg-stone-950/80 text-stone-500 italic px-2 py-0.5 rounded border border-stone-800">
                                            No database fragments contributed (all safely filtered)
                                          </span>
                                        );
                                      }
                                      return selectedRefs.map((ref) => {
                                        const didContribute = contributingIds.has(ref.id);
                                        return (
                                          <span
                                            key={ref.id}
                                            className={`text-[9px] px-2 py-0.5 rounded border flex items-center gap-1.5 ${
                                              didContribute
                                                ? 'bg-stone-950 text-amber-400 border-amber-900/40'
                                                : 'bg-stone-950/60 text-stone-500 border-stone-800/60 opacity-80'
                                            }`}
                                          >
                                            <span>{ref.name}</span>
                                            <span
                                              className={`text-[7px] uppercase font-mono px-1 py-0.2 rounded ${
                                                didContribute
                                                  ? 'text-green-400 bg-green-950/40 border border-green-900/30 font-semibold'
                                                  : 'text-stone-500 bg-stone-900/80 border border-stone-800'
                                              }`}
                                            >
                                              {didContribute ? 'Contributed' : 'Discarded'}
                                            </span>
                                          </span>
                                        );
                                      });
                                    })()}
                                  </div>
                                  {currentCard.injectedPromptBlock && (
                                    <details className="group">
                                      <summary className="text-[9px] font-bold text-stone-500 uppercase tracking-wider cursor-pointer hover:text-stone-300 flex items-center justify-between outline-none">
                                        <span>View prompt blueprint</span>
                                        <span className="text-[8px] opacity-70 group-open:hidden">Expand</span>
                                        <span className="text-[8px] opacity-70 hidden group-open:inline">Collapse</span>
                                      </summary>
                                      
                                      <div className="mt-3 space-y-3">
                                        {currentCard.synthDebug && (
  <div className="bg-stone-950/85 p-3 rounded-lg border border-stone-850 text-[10px] space-y-2 mt-2">
    <div className="font-mono text-amber-500/95 font-bold uppercase tracking-wider border-b border-stone-900 pb-1.5">
      Synthesis Logic
    </div>
    <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin pr-1 font-mono text-[9px]">
      {currentCard.synthDebug.allContributionsDiscarded && (
        <div className="text-amber-400/90 font-bold mb-1.5 p-1.5 bg-amber-950/20 border border-amber-900/30 rounded text-[9px]">
          [All evaluated database fragments were safely discarded as incompatible. Standard prompt and archetype preset strictly applied.]
        </div>
      )}
      {currentCard.synthDebug.evaluations && currentCard.synthDebug.evaluations.length > 0 && (
        <div className="mb-2">
          <span className="text-stone-500 font-bold block mb-1">Evaluated Contributions</span>
          {currentCard.synthDebug.evaluations.map((ev, i) => (
            <div key={i} className={`text-[9px] leading-relaxed mb-1 ${ev.decision === 'included' ? 'text-green-400' : 'text-stone-600 line-through'}`}>
              <span className="text-stone-500 font-bold">[{ev.referenceName} • {ev.field}]</span>{' '}
              <span>"{ev.text}"</span>
              {ev.decision === 'included' && ev.cleanedText && ev.cleanedText !== ev.text && (
                <span className="text-amber-300 font-normal"> → Kept: "{ev.cleanedText}"</span>
              )}
              <span className="text-[8px] text-stone-500 ml-1">({ev.reason})</span>
            </div>
          ))}
        </div>
      )}
      {currentCard.synthDebug.motifs && currentCard.synthDebug.motifs.length > 0 && (
        <div className="mb-2">
          <span className="text-stone-500 font-bold block mb-1">Motifs</span>
          {currentCard.synthDebug.motifs.map((m, i) => (
             <div key={i} className={`${m.used ? 'text-green-400' : 'text-stone-600 line-through'}`}>- {m.motif} ({m.reason})</div>
          ))}
        </div>
      )}
      {currentCard.synthDebug.avoidRules && currentCard.synthDebug.avoidRules.length > 0 && (
        <div className="mb-2">
          <span className="text-stone-500 font-bold block mb-1">Avoid Rules</span>
          {currentCard.synthDebug.avoidRules.map((r, i) => (
             <div key={i} className={`${r.applied ? 'text-green-400' : 'text-stone-600 line-through'}`}>- [{r.source}] {r.rule} ({r.reason})</div>
          ))}
        </div>
      )}
      {currentCard.synthDebug.identityBlocked && currentCard.synthDebug.identityBlocked.length > 0 && (
        <div>
          <span className="text-stone-500 font-bold block mb-1">Identity Blocked</span>
          {currentCard.synthDebug.identityBlocked.map((id, i) => (
             <div key={i} className="text-red-400">- {id}</div>
          ))}
        </div>
      )}
    </div>
  </div>
)}
{/* Auto select transparency logs */}
                                        {currentCard.autoSelectScores && currentCard.autoSelectScores.length > 0 && (
                                          <div className="bg-stone-950/85 p-3 rounded-lg border border-stone-850 text-[10px] space-y-2">
                                            <div className="font-mono text-amber-500/95 font-bold uppercase tracking-wider border-b border-stone-900 pb-1.5 flex items-center justify-between">
                                              <span>Visual DNA Matching Logs</span>
                                              <span className="text-[8px] text-stone-500 normal-case">Threshold: Score &gt; 0</span>
                                            </div>
                                            <div className="space-y-1.5 max-h-36 overflow-y-auto scrollbar-thin pr-1 font-mono text-[9px]">
                                              {currentCard.autoSelectScores.map((log) => (
                                                <div key={log.id} className="flex justify-between items-start gap-2 border-b border-stone-900/40 pb-1.5">
                                                  <div className="min-w-0">
                                                    <span className={`font-bold ${log.selected ? 'text-amber-400' : 'text-stone-400'} truncate block`} title={log.name}>
                                                      {log.name}
                                                    </span>
                                                    <span className="text-stone-500 text-[8px] flex gap-1 flex-wrap">
                                                      <span>Base: <strong className="text-stone-400">{log.details?.baseScore || log.score}</strong></span>
                                                      {log.details?.diversityBonus ? <span>Div: <strong className="text-green-500/70">+{log.details.diversityBonus}</strong></span> : null}
                                                      {log.details?.redundancyPenalty ? <span>Red: <strong className="text-red-500/70">-{log.details.redundancyPenalty}</strong></span> : null}
                                                      <span>Final: <strong className="text-amber-500/80">{log.details?.finalScore || log.weight}</strong></span>
                                                    </span>
                                                    {log.details?.ignoredLowConfidence && log.details.ignoredLowConfidence.length > 0 && (
                                                       <div className="flex flex-wrap gap-1 mt-1">
                                                         {log.details.ignoredLowConfidence.map((m, i) => (
                                                            <span key={i} className="text-[7px] bg-red-950/30 text-red-400/50 px-1 py-0.5 rounded border border-red-900/30" title="Ignored due to low confidence">
                                                               <s>{m.tag}</s>
                                                            </span>
                                                         ))}
                                                       </div>
                                                    )}
                                        

                                                    {log.details?.matches && log.details.matches.length > 0 && (
                                                       <div className="flex flex-wrap gap-1 mt-1">
                                                         {log.details.matches.map((m, i) => (
                                                            <span key={i} className="text-[7px] bg-stone-900 text-stone-400 px-1 py-0.5 rounded border border-stone-800">
                                                               {m.tag} <span className="text-amber-500/50">+{m.score}</span>
                                                            </span>
                                                         ))}
                                                       </div>
                                                    )}
                                        
                                                  </div>
                                                  <div className="shrink-0 pt-0.5">
                                                    {log.selected ? (
                                                      <span className="px-1.5 py-0.5 bg-green-950/35 text-green-400 border border-green-900/30 rounded text-[8px] font-bold uppercase">
                                                        Selected
                                                      </span>
                                                    ) : (
                                                      <span className="px-1.5 py-0.5 bg-stone-900/60 text-stone-600 border border-stone-950 rounded text-[8px] font-bold uppercase">
                                                        {log.score > 0 ? "Skipped" : "No Match"}
                                                      </span>
                                                    )}
                                        
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                            

                                        <p className="text-[10px] text-stone-400 font-mono bg-stone-950/60 p-3 rounded border border-stone-900 leading-relaxed whitespace-pre-line max-h-40 overflow-y-auto scrollbar-thin">
                                          <span className="text-amber-500/80 mb-2 block font-bold">
                                            [SELECTION: {currentCard.request.dbAutoSelect ? 'AUTO' : 'MANUAL'} | INTENSITY: {currentCard.request.dbIntensity?.toUpperCase()}]
                                          </span>
                                          {currentCard.injectedPromptBlock}
                                        </p>
                                      </div>
                                    </details>
                                  )}
                      
                                </div>
                              )}

                          </div>
                       )}

                  </section>
                  {/* Input Section (Second on mobile) */}
                  <section className="w-full max-w-lg order-2 lg:order-1 flex flex-col">
                      {error && (
                          <div className="mb-6 p-4 bg-red-900/10 border border-red-900/30 rounded-lg flex items-start gap-3 text-red-200 text-[11px] leading-relaxed">
                              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-500" />
                              <p>{error}</p>
                          </div>
                      )}
          

                      <div className="bg-stone-900/20 p-1 rounded-2xl border border-stone-800/30">
                        <CardForm 
                            onSubmit={handleGenerate} 
                            isLoading={isLoading} 
                            hasApiKey={apiKeySet}
                            onRequestKey={handleConnect}
                        />
                      </div>
                      
                      <footer className="mt-12 py-8 border-t border-stone-900/50 text-center lg:text-left">
                        <p className="text-stone-600 text-[10px] uppercase tracking-[0.2em]">Shadow Duel © Grimoire Artificer Engine</p>
                      </footer>
                  </section>

              </div>
            </div>
            
            {(databaseVisited || currentTab === 'database') && (
              <div hidden={currentTab !== 'database'}>
              <React.Suspense fallback={<div className="p-8 text-stone-400">Loading database...</div>}>
                <ArtstyleDatabase onBackToGrimoire={() => setCurrentTab('grimoire')} />
              </React.Suspense>
              </div>
            )}
            
            {currentTab === 'tokenMonitor' && (
              <React.Suspense fallback={<div className="p-8 text-stone-400">Loading monitor...</div>}>
                <TokenMonitor />
              </React.Suspense>
            )}
        </div>
      </main>
    </div>
  );
};

export default App;
