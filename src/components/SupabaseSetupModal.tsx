import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Database,
  RefreshCw,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';

interface SupabaseSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  supabaseConnected: boolean;
  storageMode: 'SUPABASE_POSTGRES' | 'LOCAL_POSTGRES_REPLICA';
}

interface SyncResult {
  connected: boolean;
  message?: string;
  error?: string;
  schemaMissing?: boolean;
  syncedCounts?: Record<string, number>;
  warnings?: string[];
}

export const SupabaseSetupModal: React.FC<SupabaseSetupModalProps> = ({
  isOpen,
  onClose,
  supabaseConnected,
}) => {
  const [sqlSchema, setSqlSchema] = useState<string>('');
  const [loadingSql, setLoadingSql] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testingSync, setTestingSync] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  React.useEffect(() => {
    if (isOpen && !sqlSchema) {
      setLoadingSql(true);
      fetch('/api/supabase-schema')
        .then((r) => r.json())
        .then((d) => {
          setSqlSchema(d.sql || '');
        })
        .catch(() => {
          setSqlSchema('-- Unable to load schema. Check /supabase/schema.sql in project files.');
        })
        .finally(() => setLoadingSql(false));
    }
  }, [isOpen, sqlSchema]);

  if (!isOpen) return null;

  const handleCopySql = async () => {
    if (!sqlSchema) return;
    await navigator.clipboard.writeText(sqlSchema);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleTestAndSync = async () => {
    setTestingSync(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/supabase/test-and-sync', { method: 'POST' });
      const data = (await res.json()) as SyncResult;
      setSyncResult(data);
    } catch (err) {
      setSyncResult({ connected: false, error: String(err) });
    } finally {
      setTestingSync(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Supabase SQL &amp; PostgreSQL Setup
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {supabaseConnected
                  ? 'Connected directly to your Supabase PostgreSQL instance via secure environment variables.'
                  : 'Connect your Supabase project via AI Studio Secrets + SQL Editor to enable cloud PostgreSQL & Realtime.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm">
          {/* Step 1: Env Vars */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Step 1: Add Supabase Keys in AI Studio Secrets Panel
              </span>
              <span className="text-xs font-mono text-amber-600 dark:text-amber-400">
                {supabaseConnected
                  ? 'Status: Supabase Cloud Active'
                  : 'Status: Local Relational Engine Active (Awaiting Supabase Keys)'}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Supabase Dashboard &rarr; <strong>Project Settings &rarr; API</strong> se URL aur Keys copy karke AI Studio ke <strong>Secrets</strong> panel me add karein (<code>SUPABASE_SERVICE_ROLE_KEY</code> sirf server-side <code>server.ts</code> me rehta hai):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-xs">
              <div className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-400">Frontend Client &amp; Realtime:</div>
                <div className="text-slate-800 dark:text-slate-200">VITE_SUPABASE_URL</div>
                <div className="text-slate-800 dark:text-slate-200">VITE_SUPABASE_ANON_KEY</div>
              </div>
              <div className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-400">Backend Atomic Transactions:</div>
                <div className="text-slate-800 dark:text-slate-200">SUPABASE_URL</div>
                <div className="text-slate-800 dark:text-slate-200">SUPABASE_SERVICE_ROLE_KEY</div>
              </div>
            </div>
          </div>

          {/* Step 2: SQL Editor */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-500" />
                Step 2: Copy &amp; Run SQL Schema in Supabase SQL Editor (16 Tables)
              </span>
              <button
                type="button"
                onClick={handleCopySql}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-semibold text-xs hover:bg-amber-400 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied SQL Schema!' : 'Copy Full SQL Schema'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Supabase Dashboard &rarr; <strong>SQL Editor &rarr; New Query</strong> me paste karke <strong>Run</strong> dabayein. Isse sabhi 16 tables, indexes, aur UPI settings columns create ho jayenge.
            </p>
            <pre className="max-h-56 overflow-y-auto p-3 rounded-xl bg-slate-950 text-slate-200 font-mono text-xs border border-slate-800 leading-relaxed">
              {loadingSql ? 'Loading supabase/schema.sql...' : sqlSchema}
            </pre>
          </div>

          {/* Step 3: Test & Sync */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                  Step 3: Verify SQL Tables &amp; Sync Salon Data to Supabase
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Test live connection to Supabase PostgreSQL and push existing services, staff, customers &amp; bills.
                </p>
              </div>
              <button
                type="button"
                disabled={testingSync}
                onClick={handleTestAndSync}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingSync ? 'animate-spin' : ''}`} />
                <span>{testingSync ? 'Testing & Syncing...' : 'Test Connection & Sync Data'}</span>
              </button>
            </div>

            {syncResult && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                  syncResult.connected
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  {syncResult.connected ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{syncResult.connected ? syncResult.message : syncResult.error}</span>
                </div>

                {syncResult.syncedCounts && (
                  <div className="font-mono text-[11px] flex flex-wrap gap-x-3 gap-y-1 pt-1">
                    {Object.entries(syncResult.syncedCounts).map(([table, count]) => (
                      <span key={table}>
                        {table}: <strong>{count}</strong>
                      </span>
                    ))}
                  </div>
                )}

                {syncResult.warnings && syncResult.warnings.length > 0 && (
                  <div className="text-[11px] text-amber-600 dark:text-amber-400">
                    Warnings: {syncResult.warnings.join(' | ')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-sm font-medium hover:opacity-90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
