import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Layers, ShieldCheck, BookOpen, Users } from 'lucide-react';
import { auth, googleProvider } from '../firebase';

interface AuthScreenProps {
  externalError?: string | null;
  onClearExternalError?: () => void;
}

export function AuthScreen({
  externalError = null,
  onClearExternalError,
}: AuthScreenProps) {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    onClearExternalError?.();
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to complete sign-in.';
      if (!message.includes('popup-closed-by-user')) {
        setAuthError(message);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const activeError = externalError || authError;

  return (
    <div className="min-h-screen bg-[#f7f8fa] flex flex-col lg:flex-row">
      {/* Left Industrial Brand Panel */}
      <div className="lg:w-[46%] bg-[#0f172a] text-slate-100 p-8 sm:p-12 lg:p-16 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-9 h-9 rounded-md bg-[#1e3a8a] border border-blue-400/20 flex items-center justify-center text-white shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="block font-display text-lg font-semibold tracking-tight text-white leading-tight">
                Mayer Doa washing
              </span>
              <span className="block text-xs text-slate-300 mt-0.5">
                মায়ের দোয়া ওয়াশিং এন্ড প্রসেসিং মিলস্
              </span>
            </div>
          </div>

          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-tight max-w-md mb-5">
            Client accounts and ledger control for dyeing and washing mills.
          </h1>
          <p className="text-slate-300 text-base leading-relaxed max-w-md">
            Maintain accurate buyer profiles, opening dues, dyeing bills, and payment
            receipts with every receivable derived dynamically from your audit-grade
            client ledger.
          </p>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <Users className="w-4 h-4 text-blue-400 mb-2" />
            <p className="text-sm font-medium text-white">Client Registry</p>
            <p className="text-xs text-slate-400 mt-1">
              Buyer profiles, factory addresses, and contact records.
            </p>
          </div>
          <div>
            <BookOpen className="w-4 h-4 text-blue-400 mb-2" />
            <p className="text-sm font-medium text-white">Dynamic Ledger</p>
            <p className="text-xs text-slate-400 mt-1">
              Current Due computed live as Sum of Debit minus Sum of Credit.
            </p>
          </div>
          <div>
            <ShieldCheck className="w-4 h-4 text-blue-400 mb-2" />
            <p className="text-sm font-medium text-white">Immutable Trail</p>
            <p className="text-xs text-slate-400 mt-1">
              Append-only Firestore accounting with verified operator access.
            </p>
          </div>
        </div>
      </div>

      {/* Right Sign-In Panel */}
      <div className="flex-1 flex items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-8 sm:p-10">
          <p className="text-xs font-medium text-slate-500 mb-2">
            Mill Accounts Workspace
          </p>
          <h2 className="font-display text-2xl font-semibold text-slate-900 mb-2">
            Sign in to continue
          </h2>
          <p className="text-sm text-slate-600 mb-8 leading-relaxed">
            Authenticate with your Google account to manage mill clients, opening due
            balances, and client ledger entries.
          </p>

          {activeError && (
            <div
              role="alert"
              className="mb-6 p-3.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md"
            >
              {activeError}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e3a8a]"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.24-.94 2.29-2 2.99v2.48h3.23c1.89-1.74 2.98-4.3 2.98-7.35 0-.68-.06-1.35-.18-2.04z"
              />
              <path
                fill="currentColor"
                d="M12.17 21c2.7 0 4.96-.9 6.62-2.43l-3.23-2.48c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H3.24v2.57A9.99 9.99 0 0 0 12.17 21z"
              />
              <path
                fill="currentColor"
                d="M6.58 12.93a6.03 6.03 0 0 1 0-3.86V6.5H3.24a10.01 10.01 0 0 0 0 8.99l3.34-2.56z"
              />
              <path
                fill="currentColor"
                d="M12.17 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87C17.13 2.97 14.87 2 12.17 2A9.99 9.99 0 0 0 3.24 7.5l3.34 2.57c.79-2.36 2.99-4.12 5.59-4.12z"
              />
            </svg>
            <span className="whitespace-nowrap">
              {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
            </span>
          </button>

          <p className="mt-6 text-xs text-slate-500 leading-relaxed">
            Your mill data is private to your authenticated Firebase account and
            protected by Firestore security rules.
          </p>
        </div>
      </div>
    </div>
  );
}
