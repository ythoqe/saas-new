import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { Trash2, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  LEDGER_VALIDATION,
  SUPPLIER_VALIDATION,
  type SupplierRecord,
} from '../types/mill';
import { roundCurrency } from '../utils/ledger';

interface AddSupplierDrawerProps {
  open: boolean;
  ownerId: string;
  editingSupplier: SupplierRecord | null;
  onClose: () => void;
  onDeleteSupplier?: (supplier: SupplierRecord) => void;
  onSuccess: (message: string) => void;
}

export function AddSupplierDrawer({
  open,
  ownerId,
  editingSupplier,
  onClose,
  onDeleteSupplier,
  onSuccess,
}: AddSupplierDrawerProps) {
  const { t } = useLanguage();
  const [supplierName, setSupplierName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [mobile, setMobile] = useState('');
  const [openingPayable, setOpeningPayable] = useState('0');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = Boolean(editingSupplier);

  useEffect(() => {
    if (open) {
      if (editingSupplier) {
        setSupplierName(editingSupplier.supplierName);
        setCompanyName(editingSupplier.companyName);
        setMobile(editingSupplier.mobile);
        setOpeningPayable('0');
      } else {
        setSupplierName('');
        setCompanyName('');
        setMobile('');
        setOpeningPayable('0');
      }
      setValidationError(null);
    }
  }, [open, editingSupplier]);

  if (!open) return null;

  const validateForm = (): {
    trimmedName: string;
    trimmedCompany: string;
    trimmedMobile: string;
    parsedOpeningPayable: number;
  } | null => {
    const trimmedName = supplierName.trim();
    const trimmedCompany = companyName.trim();
    const trimmedMobile = mobile.trim();

    if (
      trimmedName.length < SUPPLIER_VALIDATION.supplierNameMin ||
      trimmedName.length > SUPPLIER_VALIDATION.supplierNameMax
    ) {
      setValidationError(
        `Supplier Name is required and must be at most ${SUPPLIER_VALIDATION.supplierNameMax} characters.`
      );
      return null;
    }

    if (
      trimmedCompany.length < SUPPLIER_VALIDATION.companyNameMin ||
      trimmedCompany.length > SUPPLIER_VALIDATION.companyNameMax
    ) {
      setValidationError(
        `Company Name is required and must be at most ${SUPPLIER_VALIDATION.companyNameMax} characters.`
      );
      return null;
    }

    if (
      trimmedMobile.length < SUPPLIER_VALIDATION.mobileMin ||
      trimmedMobile.length > SUPPLIER_VALIDATION.mobileMax ||
      !SUPPLIER_VALIDATION.mobilePattern.test(trimmedMobile)
    ) {
      setValidationError(
        'Mobile must be 5–25 characters and contain only digits, spaces, +, -, or parentheses.'
      );
      return null;
    }

    const rawOpening =
      openingPayable.trim() === '' ? 0 : Number(openingPayable);
    if (!Number.isFinite(rawOpening) || rawOpening < 0) {
      setValidationError('Opening Payable must be 0 or a positive number.');
      return null;
    }
    if (rawOpening > LEDGER_VALIDATION.maxAmount) {
      setValidationError(
        `Opening Payable cannot exceed ${LEDGER_VALIDATION.maxAmount.toLocaleString()}.`
      );
      return null;
    }

    return {
      trimmedName,
      trimmedCompany,
      trimmedMobile,
      parsedOpeningPayable: roundCurrency(rawOpening),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const validated = validateForm();
    if (!validated) return;

    setIsSubmitting(true);
    try {
      if (editingSupplier) {
        const supplierRef = doc(db, 'suppliers', editingSupplier.id);
        try {
          await updateDoc(supplierRef, {
            supplierName: validated.trimmedName,
            companyName: validated.trimmedCompany,
            mobile: validated.trimmedMobile,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.UPDATE,
            `suppliers/${editingSupplier.id}`
          );
        }
        onSuccess(`Updated supplier profile for ${validated.trimmedName}.`);
        onClose();
        return;
      }

      // Create new supplier (NO stored balance) + atomic opening payable credit in supplier_ledger
      const batch = writeBatch(db);
      const supplierRef = doc(collection(db, 'suppliers'));

      batch.set(supplierRef, {
        ownerId,
        supplierName: validated.trimmedName,
        companyName: validated.trimmedCompany,
        mobile: validated.trimmedMobile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (validated.parsedOpeningPayable > 0) {
        const ledgerRef = doc(collection(db, 'supplier_ledger'));
        batch.set(ledgerRef, {
          ownerId,
          supplierId: supplierRef.id,
          txn_type: 'opening',
          credit: validated.parsedOpeningPayable,
          debit: 0,
          reference: 'OPENING',
          note: 'Opening payable balance recorded at supplier onboarding',
          createdAt: serverTimestamp(),
        });
      }

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'suppliers');
      }

      onSuccess(
        validated.parsedOpeningPayable > 0
          ? `Added ${validated.trimmedName} and posted opening payable to supplier_ledger.`
          : `Added ${validated.trimmedName} to Suppliers.`
      );
      onClose();
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : 'Failed to save supplier record.'
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
      aria-labelledby="supplier-drawer-title"
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
              id="supplier-drawer-title"
              className="font-display text-lg font-semibold text-slate-900"
            >
              {isEditing
                ? t('suppliers.form.editTitle')
                : t('suppliers.form.addTitle')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isEditing
                ? t('suppliers.form.editSubtitle')
                : t('suppliers.form.addSubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close supplier form"
            className="p-2 text-slate-400 hover:text-slate-700 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
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
                htmlFor="supplierName"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                {t('suppliers.form.supplierName')}{' '}
                <span className="text-red-600">*</span>
              </label>
              <input
                id="supplierName"
                type="text"
                required
                maxLength={SUPPLIER_VALIDATION.supplierNameMax}
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. Md. Shamsul Alam"
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            <div>
              <label
                htmlFor="supplierCompany"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                {t('suppliers.form.companyName')}{' '}
                <span className="text-red-600">*</span>
              </label>
              <input
                id="supplierCompany"
                type="text"
                required
                maxLength={SUPPLIER_VALIDATION.companyNameMax}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Meghna Chemical & Dye Supply"
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            <div>
              <label
                htmlFor="supplierMobile"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                {t('common.mobile')} <span className="text-red-600">*</span>
              </label>
              <input
                id="supplierMobile"
                type="tel"
                required
                minLength={SUPPLIER_VALIDATION.mobileMin}
                maxLength={SUPPLIER_VALIDATION.mobileMax}
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="e.g. +880 1811-000000"
                className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            {!isEditing && (
              <div className="pt-4 border-t border-slate-200">
                <label
                  htmlFor="openingPayable"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {t('suppliers.form.openingPayable')}
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-500">
                    ৳
                  </span>
                  <input
                    id="openingPayable"
                    type="number"
                    min="0"
                    max={LEDGER_VALIDATION.maxAmount}
                    step="0.01"
                    value={openingPayable}
                    onChange={(e) => setOpeningPayable(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  If greater than 0, an initial payable entry posts atomically to{' '}
                  <span className="font-mono text-slate-700">supplier_ledger</span>{' '}
                  with <span className="font-mono text-slate-700">txn_type: opening</span>,{' '}
                  <span className="font-mono text-slate-700">credit: amount</span>,{' '}
                  <span className="font-mono text-slate-700">debit: 0</span>.
                </p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
            <div>
              {editingSupplier && onDeleteSupplier ? (
                <button
                  type="button"
                  onClick={() => {
                    const target = editingSupplier;
                    onClose();
                    onDeleteSupplier(target);
                  }}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('suppliers.form.deleteSupplier')}
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                {isSubmitting
                  ? t('common.saving')
                  : isEditing
                    ? t('common.saveChanges')
                    : t('suppliers.form.saveSupplier')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
