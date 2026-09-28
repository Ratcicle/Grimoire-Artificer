import React, { useState, useEffect } from 'react';
import { BarChart3, RefreshCw, Trash2, Download, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { TokenUsageLog } from '../types';
import { getTokenLogs, clearTokenLogs } from '../services/localDbService';

export const TokenMonitor: React.FC = () => {
  const [logs, setLogs] = useState<TokenUsageLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const data = await getTokenLogs();
      // Sort newest first
      setLogs(data.sort((a, b) => b.timestamp - a.timestamp));
    } catch (err) {
      console.error("Failed to load token logs", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleClear = async () => {
    await clearTokenLogs();
    setLogs([]);
    setIsConfirmingClear(false);
  };

  const exportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "token_usage_logs.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const totalCalls = logs.length;
  const successfulCalls = logs.filter(l => l.success);
  
  const totalInputTokens = logs.reduce((sum, log) => sum + (log.promptTokenCount || 0), 0);
  const totalOutputTokens = logs.reduce((sum, log) => sum + (log.candidatesTokenCount || 0), 0);
  const totalTokens = logs.reduce((sum, log) => sum + (log.totalTokenCount || 0), 0);
  const totalThinkingTokens = logs.reduce((sum, log) => sum + (log.thoughtsTokenCount || 0), 0);
  
  const avgTokensPerCall = successfulCalls.length ? Math.round(totalTokens / successfulCalls.length) : 0;
  const latestModel = logs[0]?.model || "N/A";

  // Group by operation
  const opsSummary = logs.reduce((acc, log) => {
    if (!acc[log.operationType]) acc[log.operationType] = { count: 0, tokens: 0 };
    acc[log.operationType].count += 1;
    acc[log.operationType].tokens += (log.totalTokenCount || 0);
    return acc;
  }, {} as Record<string, { count: number, tokens: number }>);

  // Group by model
  const modelSummary = logs.reduce((acc, log) => {
    if (!acc[log.model]) acc[log.model] = { count: 0, input: 0, output: 0, thinking: 0, total: 0 };
    acc[log.model].count += 1;
    acc[log.model].input += (log.promptTokenCount || 0);
    acc[log.model].output += (log.candidatesTokenCount || 0);
    acc[log.model].thinking += (log.thoughtsTokenCount || 0);
    acc[log.model].total += (log.totalTokenCount || 0);
    return acc;
  }, {} as Record<string, { count: number, input: number, output: number, thinking: number, total: number }>);

  // Identify sessions (Analyze All)
  const sessionIds = Array.from(new Set(logs.filter(l => l.sessionId).map(l => l.sessionId as string)));
  const sessionSummaries = sessionIds.map(sid => {
    const sessionLogs = logs.filter(l => l.sessionId === sid);
    const successCount = sessionLogs.filter(l => l.success).length;
    return {
      id: sid,
      timestamp: Math.min(...sessionLogs.map(l => l.timestamp)),
      totalCalls: sessionLogs.length,
      successCount,
      totalTokens: sessionLogs.reduce((sum, log) => sum + (log.totalTokenCount || 0), 0),
      avgTokens: successCount > 0 ? Math.round(sessionLogs.reduce((sum, log) => sum + (log.totalTokenCount || 0), 0) / successCount) : 0
    };
  }).sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="w-full flex flex-col gap-6 text-stone-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-serif text-amber-500">Token Usage Monitor</h2>
          <p className="text-xs text-stone-500 uppercase tracking-wider mt-1">Track your Gemini API token consumption</p>
        </div>
        <div className="flex items-center gap-2">
          {isConfirmingClear ? (
            <div className="flex items-center gap-2 bg-red-950/20 border border-red-900/50 p-1 rounded">
              <span className="text-xs text-red-500 font-bold px-2 uppercase tracking-widest">Are you sure?</span>
              <button onClick={handleClear} className="px-3 py-1 text-xs font-bold bg-red-600 text-white rounded hover:bg-red-500 transition-colors">Yes</button>
              <button onClick={() => setIsConfirmingClear(false)} className="px-3 py-1 text-xs font-bold text-stone-400 hover:text-white transition-colors">No</button>
            </div>
          ) : (
            <>
              <button onClick={loadLogs} className="p-2 rounded border border-stone-800 bg-stone-900 hover:bg-stone-800 hover:text-white transition-colors" title="Refresh">
                <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
              </button>
              <button onClick={exportJSON} className="p-2 rounded border border-stone-800 bg-stone-900 hover:bg-stone-800 hover:text-amber-500 transition-colors flex items-center gap-2">
                <Download size={16} /> <span className="text-xs uppercase font-bold tracking-widest">Export JSON</span>
              </button>
              <button onClick={() => setIsConfirmingClear(true)} className="p-2 rounded border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-red-900/40 transition-colors" title="Clear Logs">
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-stone-800 bg-stone-900/50">
          <p className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">Total Tokens</p>
          <p className="text-2xl font-mono text-white">{totalTokens.toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-xl border border-stone-800 bg-stone-900/50">
          <p className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">Total Input Tokens</p>
          <p className="text-2xl font-mono text-blue-400">{totalInputTokens.toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-xl border border-stone-800 bg-stone-900/50">
          <p className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">Total Output Tokens</p>
          <p className="text-2xl font-mono text-green-400">{totalOutputTokens.toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-xl border border-stone-800 bg-stone-900/50">
          <p className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">Avg Tokens / Call</p>
          <p className="text-2xl font-mono text-amber-500">{avgTokensPerCall.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        {/* Model Summary */}
        <div className="p-5 rounded-xl border border-stone-800 bg-stone-950 shadow-inner overflow-hidden">
          <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 mb-4 border-b border-stone-800 pb-2">Usage by Model</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="text-stone-500 uppercase">
                  <th className="pb-2 font-normal">Model</th>
                  <th className="pb-2 font-normal">Calls</th>
                  <th className="pb-2 font-normal">Input</th>
                  <th className="pb-2 font-normal">Output</th>
                  <th className="pb-2 font-normal">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/50">
                {Object.entries(modelSummary).map(([model, stats]: [string, any]) => (
                  <tr key={model} className="hover:bg-stone-900/30">
                    <td className="py-2 text-stone-300">{model}</td>
                    <td className="py-2 text-stone-400">{stats.count}</td>
                    <td className="py-2 text-blue-400/80">{stats.input.toLocaleString()}</td>
                    <td className="py-2 text-green-400/80">{stats.output.toLocaleString()}</td>
                    <td className="py-2 text-amber-500/80">{stats.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Operation Summary */}
        <div className="p-5 rounded-xl border border-stone-800 bg-stone-950 shadow-inner overflow-hidden">
          <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 mb-4 border-b border-stone-800 pb-2">Usage by Operation</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="text-stone-500 uppercase">
                  <th className="pb-2 font-normal">Operation</th>
                  <th className="pb-2 font-normal">Calls</th>
                  <th className="pb-2 font-normal">Total Tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/50">
                {Object.entries(opsSummary).map(([op, stats]: [string, any]) => (
                  <tr key={op} className="hover:bg-stone-900/30">
                    <td className="py-2 text-stone-300">{op}</td>
                    <td className="py-2 text-stone-400">{stats.count}</td>
                    <td className="py-2 text-amber-500/80">{stats.tokens.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {sessionSummaries.length > 0 && (
        <div className="mt-4 p-5 rounded-xl border border-stone-800 bg-stone-950 shadow-inner">
          <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 mb-4 border-b border-stone-800 pb-2">Batch Analysis Sessions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sessionSummaries.map(session => (
              <div key={session.id} className="p-3 bg-stone-900/50 rounded border border-stone-800/50 flex flex-col gap-1">
                <span className="text-[9px] text-stone-500 uppercase">{new Date(session.timestamp).toLocaleString()}</span>
                <span className="text-xs text-stone-300"><b>{session.successCount}/{session.totalCalls}</b> Successful</span>
                <span className="text-xs font-mono text-amber-500">{session.totalTokens.toLocaleString()} Tokens Total</span>
                <span className="text-[10px] text-stone-400">~{session.avgTokens.toLocaleString()} avg / image</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 mb-4 border-b border-stone-800 pb-2">Detailed Log History</h3>
        {logs.length === 0 ? (
          <div className="py-12 text-center text-stone-500 text-sm">
            No token usage logs found. Run some generations or analysis.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-800 max-h-[500px] overflow-y-auto">
            <table className="w-full text-left text-[11px] font-mono whitespace-nowrap">
              <thead className="bg-stone-900 sticky top-0 z-10 shadow-md">
                <tr className="text-stone-500 uppercase">
                  <th className="p-3 font-normal">Date/Time</th>
                  <th className="p-3 font-normal">Operation</th>
                  <th className="p-3 font-normal">Model</th>
                  <th className="p-3 font-normal">Input</th>
                  <th className="p-3 font-normal">Output</th>
                  <th className="p-3 font-normal">Cached</th>
                  <th className="p-3 font-normal">Tools</th>
                  <th className="p-3 font-normal">Thoughts</th>
                  <th className="p-3 font-normal">Unaccounted</th>
                  <th className="p-3 font-normal">Total</th>
                  <th className="p-3 font-normal text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/50 bg-stone-950/50">
                {logs.map((log) => {
                  const accountedTokens = (log.promptTokenCount || 0) + 
                                          (log.candidatesTokenCount || 0) + 
                                          (log.cachedContentTokenCount || 0) + 
                                          (log.toolUsePromptTokenCount || 0) + 
                                          (log.thoughtsTokenCount || 0);
                  const unaccounted = (log.totalTokenCount || 0) - accountedTokens;
                  return (
                  <tr key={log.id} className="hover:bg-stone-900/50 transition-colors">
                    <td className="p-3 text-stone-400">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="p-3 text-stone-300">
                      {log.operationType}
                      {log.sessionId && <span className="ml-1 text-[9px] text-stone-600">(Batch)</span>}
                    </td>
                    <td className="p-3 text-stone-400">{log.model}</td>
                    <td className="p-3 text-blue-400/70">{log.promptTokenCount > 0 ? log.promptTokenCount : '-'}</td>
                    <td className="p-3 text-green-400/70">{log.candidatesTokenCount > 0 ? log.candidatesTokenCount : '-'}</td>
                    <td className="p-3 text-emerald-400/70">{log.cachedContentTokenCount ? log.cachedContentTokenCount : '-'}</td>
                    <td className="p-3 text-purple-400/70">{log.toolUsePromptTokenCount ? log.toolUsePromptTokenCount : '-'}</td>
                    <td className="p-3 text-pink-400/70">{log.thoughtsTokenCount > 0 ? log.thoughtsTokenCount : '-'}</td>
                    <td className="p-3 text-stone-500/70" title={log.rawUsageMetadata ? JSON.stringify(log.rawUsageMetadata, null, 2) : "Hover to see raw data"}>
                      {unaccounted > 0 ? unaccounted : '-'}
                    </td>
                    <td className="p-3 text-amber-500/70">{log.totalTokenCount > 0 ? log.totalTokenCount : '-'}</td>
                    <td className="p-3 text-center">
                      {log.success ? (
                        <CheckCircle size={14} className="text-green-500 mx-auto" />
                      ) : (
                        <div className="flex justify-center" title={log.errorMessage}>
                          <AlertCircle size={14} className="text-red-500" />
                        </div>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

export default TokenMonitor;
