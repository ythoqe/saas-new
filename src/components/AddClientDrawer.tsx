import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  CLIENT_VALIDATION,
  LEDGER_VALIDATION,
  type ClientRecord,
} from '../types/mill';
import { roundCurrency } from '../utils/ledger';

interface AddClientDrawerProps {
  open: boolean;
  ownerId: string;
  editingClient: ClientRecord | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function AddClientDrawer({
  open,
  ownerId,
  editingClient,
  onClose,
  onSuccess,
}: AddClientDrawerProps) {
  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [openingDue, setOpeningDue] = useState('0');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = Boolean(editingClient);

  useEffect(() => {
    if (open) {
      if (editingClient) {
        setClientName(editingClient.clientName);
        setCompanyName(editingClient.companyName);
        setMobile(editingClient.mobile);
        setAddress(editingClient.address);
        setOpeningDue('0');
      } else {
        setClientName('');
        setCompanyName('');
        setMobile('');
        setAddress('');
        setOpeningDue('0');
      }
      setValidationError(null);
    }
  }, [open, editingClient]);

  if (!open) return null;

  const validateForm = (): {
    trimmedName: string;
    trimmedCompany: string;
    trimmedMobile: string;
    trimmedAddress: string;
    parsedOpeningDue: number;
  } | null => {
    const trimmedName = clientName.trim();
    const trimmedCompany = companyName.trim();
    const trimmedMobile = mobile.trim();
    const trimmedAddress = address.trim();

    if (
      trimmedName.length < CLIENT_VALIDATION.clientNameMin ||
      trimmedName.length > CLIENT_VALIDATION.clientNameMax
    ) {
      setValidationError(
        `Client Name is required and must be at most ${CLIENT_VALIDATION.clientNameMax} characters.`
      );
      return null;
    }

    if (
      trimmedCompany.length < CLIENT_VALIDATION.companyNameMin ||
      trimmedCompany.length > CLIENT_VALIDATION.companyNameMax
    ) {
      setValidationError(
        `Company Name is required and must be at most ${CLIENT_VALIDATION.companyNameMax} characters.`
      );
      return null;
    }

    if (
      trimmedMobile.length < CLIENT_VALIDATION.mobileMin ||
      trimmedMobile.length > CLIENT_VALIDATION.mobileMax ||
      !CLIENT_VALIDATION.mobilePattern.test(trimmedMobile)
    ) {
      setValidationError(
        'Mobile must be 5–25 characters and contain only digits, spaces, +, -, or parentheses.'
      );
      return null;
    }

    if (
      trimmedAddress.length < CLIENT_VALIDATION.addressMin ||
      trimmedAddress.length > CLIENT_VALIDATION.addressMax
    ) {
      setValidationError(
        `Address is required and must be at most ${CLIENT_VALIDATION.addressMax} characters.`
      );
      return null;
    }

    const rawOpening = openingDue.trim() === '' ? 0 : Number(openingDue);
    if (!Number.isFinite(rawOpening) || rawOpening < 0) {
      setValidationError('Opening Due must be 0 or a positive number.');
      return null;
    }
    if (rawOpening > LEDGER_VALIDATION.maxAmount) {
      setValidationError(
        `Opening Due cannot exceed ${LEDGER_VALIDATION.maxAmount.toLocaleString()}.`
      );
      return null;
    }

    return {
      trimmedName,
      trimmedCompany,
      trimmedMobile,
      trimmedAddress,
      parsedOpeningDue: roundCurrency(rawOpening),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const validated = validateForm();
    if (!validated) return;

    setIsSubmitting(true);
    try {
      if (editingClient) {
        const clientRef = doc(db, 'clients', editingClient.id);
        try {
          await updateDoc(clientRef, {
            clientName: validated.trimmedName,
            companyName: validated.trimmedCompany,
            mobile: validated.trimmedMobile,
            address: validated.trimmedAddress,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.UPDATE,
            `clients/${editingClient.id}`
          );
        }
        onSuccess(`Updated profile for ${validated.trimmedName}.`);
        onClose();
        return;
      }

      // Create new client (strictly NO 'balance' field) + atomic opening ledger entry if Opening Due > 0
      const batch = writeBatch(db);
      const clientRef = doc(collection(db, 'clients'));

      batch.set(clientRef, {
        ownerId,
        clientName: validated.trimmedName,
        companyName: validated.trimmedCompany,
        mobile: validated.trimmedMobile,
        address: validated.trimmedAddress,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (validated.parsedOpeningDue > 0) {
        const ledgerRef = doc(collection(db, 'client_ledger'));
        batch.set(ledgerRef, {
          ownerId,
          clientId: clientRef.id,
          txn_type: 'opening',
          debit: validated.parsedOpeningDue,
          credit: 0,
          note: 'Opening due balance recorded at client onboarding',
          reference: 'OPENING',
          createdAt: serverTimestamp(),
        });
      }

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'clients');
      }

      onSuccess(
        validated.parsedOpeningDue > 0
          ? `Added ${validated.trimmedName} and posted opening due to client_ledger.`
          : `Added ${validated.trimmedName} to Client Management.`
      );
      onClose();
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : 'Failed to save client record.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-drawer-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-lg bg-white h-full border-l border-slate-200 flex flex-col">
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2
              id="client-drawer-title"
              className="font-display text-lg font-semibold text-slate-900"
            >
              {isEditing ? 'Edit Client Profile' : 'Add New Client'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isEditing
                ? 'Update contact details without altering ledger history.'
                : 'Register a dyeing or washing mill buyer and optional previous due.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close form"
            className="p-2 text-slate-400 hover:text-slate-700 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
            {validationError && (
              <div
                role="alert"
                className="p-3.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md"
              >
                {validationError}
              </div>
            )}

            <div>
              <label
                htmlFor="clientName"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Client Name <span className="text-red-600">*</span>
              </label>
              <input
                id="clientName"
                type="text"
                required
                maxLength={CLIENT_VALIDATION.clientNameMax}
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Md. Tariqul Islam"
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            <div>
              <label
                htmlFor="companyName"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Company Name <span className="text-red-600">*</span>
              </label>
              <input
                id="companyName"
                type="text"
                required
                maxLength={CLIENT_VALIDATION.companyNameMax}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Padma Knit Composite Ltd."
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            <div>
              <label
                htmlFor="mobile"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Mobile <span className="text-red-600">*</span>
              </label>
              <input
                id="mobile"
                type="tel"
                required
                minLength={CLIENT_VALIDATION.mobileMin}
                maxLength={CLIENT_VALIDATION.mobileMax}
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="e.g. +880 1711-000000"
                className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            <div>
              <label
                htmlFor="address"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Address <span className="text-red-600">*</span>
              </label>
              <textarea
                id="address"
                required
                rows={3}
                maxLength={CLIENT_VALIDATION.addressMax}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Plot 42, BSCIC Industrial Area, Konabari, Gazipur"
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a] resize-none"
              />
            </div>

            {!isEditing && (
              <div className="pt-4 border-t border-slate-200">
                <label
                  htmlFor="openingDue"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Opening Due (Previous Due)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-500">
                    ৳
                  </span>
                  <input
                    id="openingDue"
                    type="number"
                    min="0"
                    max={LEDGER_VALIDATION.maxAmount}
                    step="0.01"
                    value={openingDue}
                    onChange={(e) => setOpeningDue(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  If greater than 0, an initial ledger entry will be posted atomically to{' '}
                  <span className="font-mono text-slate-700">client_ledger</span> with{' '}
                  <span className="font-mono text-slate-700">txn_type: opening</span>,{' '}
                  <span className="font-mono text-slate-700">debit: amount</span>, and{' '}
                  <span className="font-mono text-slate-700">credit: 0</span>.
                </p>
              </div>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              {isSubmitting
                ? 'Saving...'
                : isEditing
                  ? 'Save Changes'
                  : 'Save Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
