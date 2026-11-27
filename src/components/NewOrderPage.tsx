import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ArrowLeft, Plus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  FABRIC_TYPES,
  IN_PROGRESS_ORDER_STATUSES,
  ORDER_VALIDATION,
  type ClientRecord,
  type FabricType,
  type InProgressOrderStatus,
} from '../types/mill';
import {
  formatCurrency,
  formatNumber,
  generateOrderId,
  getTodayIsoDate,
  roundCurrency,
} from '../utils/ledger';

interface NewOrderPageProps {
  ownerId: string;
  clients: ClientRecord[];
  onCancel: () => void;
  onAddClient: () => void;
  onOrderCreated: (orderId: string, clientName: string) => void;
}

export function NewOrderPage({
  ownerId,
  clients,
  onCancel,
  onAddClient,
  onOrderCreated,
}: NewOrderPageProps) {
  const { t, translateOrderStatus } = useLanguage();
  const sortedClients = useMemo(
    () =>
      [...clients].sort((a, b) => a.clientName.localeCompare(b.clientName)),
    [clients]
  );

  const [clientId, setClientId] = useState('');
  const [orderDate, setOrderDate] = useState(() => getTodayIsoDate());
  const [fabricType, setFabricType] = useState<FabricType>('মার্কিন');
  const [greyFabricThan, setGreyFabricThan] = useState('');
  const [greyFabricGaj, setGreyFabricGaj] = useState('');
  const [rate, setRate] = useState('');
  const [status, setStatus] = useState<InProgressOrderStatus>('Processing');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedClient = useMemo(
    () => sortedClients.find((c) => c.id === clientId) ?? null,
    [sortedClients, clientId]
  );

  const parsedThan = Number(greyFabricThan);
  const parsedGaj = Number(greyFabricGaj);
  const parsedRate = Number(rate);

  const estimatedBill =
    Number.isFinite(parsedGaj) &&
    parsedGaj > 0 &&
    Number.isFinite(parsedRate) &&
    parsedRate > 0
      ? roundCurrency(parsedGaj * parsedRate)
      : null;

  const avgGajPerThan =
    Number.isFinite(parsedGaj) &&
    parsedGaj > 0 &&
    Number.isFinite(parsedThan) &&
    parsedThan > 0
      ? roundCurrency(parsedGaj / parsedThan)
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!clientId || !selectedClient) {
      setFormError('Please select a Client from the dropdown.');
      return;
    }

    if (!ORDER_VALIDATION.orderDatePattern.test(orderDate)) {
      setFormError('Order Date must be in YYYY-MM-DD format.');
      return;
    }

    if (!FABRIC_TYPES.includes(fabricType)) {
      setFormError('Please select a valid Fabric Type.');
      return;
    }

    if (
      !Number.isFinite(parsedThan) ||
      parsedThan <= 0 ||
      parsedThan > ORDER_VALIDATION.maxThan
    ) {
      setFormError(
        `Grey Fabric Than must be greater than 0 and at most ${ORDER_VALIDATION.maxThan.toLocaleString()}.`
      );
      return;
    }

    if (
      !Number.isFinite(parsedGaj) ||
      parsedGaj <= 0 ||
      parsedGaj > ORDER_VALIDATION.maxGaj
    ) {
      setFormError(
        `Grey Fabric Gaj must be greater than 0 and at most ${ORDER_VALIDATION.maxGaj.toLocaleString()}.`
      );
      return;
    }

    if (
      !Number.isFinite(parsedRate) ||
      parsedRate <= 0 ||
      parsedRate > ORDER_VALIDATION.maxRate
    ) {
      setFormError(
        `Rate must be greater than 0 and at most ${ORDER_VALIDATION.maxRate.toLocaleString()}.`
      );
      return;
    }

    const cleanThan = roundCurrency(parsedThan);
    const cleanGaj = roundCurrency(parsedGaj);
    const cleanRate = roundCurrency(parsedRate);
    const orderId = generateOrderId(orderDate);

    setIsSubmitting(true);
    try {
      try {
        await setDoc(doc(db, 'orders', orderId), {
          ownerId,
          clientId,
          orderDate,
          fabricType,
          greyFabricThan: cleanThan,
          greyFabricGaj: cleanGaj,
          rate: cleanRate,
          status,
          finalGaj: null,
          finalBillAmount: null,
          deliveredAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `orders/${orderId}`);
      }

      onOrderCreated(orderId, selectedClient.clientName);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Unable to create order.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('orders.form.backToOrders')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main New Order Form */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-semibold text-slate-900">
              {t('orders.form.heading')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('orders.form.subheading')}
            </p>
          </div>

          <div className="p-6 space-y-5">
            {formError && (
              <div
                role="alert"
                className="p-3.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md"
              >
                {formError}
              </div>
            )}

            {/* Client Dropdown */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="orderClient"
                  className="block text-sm font-medium text-slate-700"
                >
                  {t('orders.form.client')} <span className="text-red-600">*</span>
                </label>
                <button
                  type="button"
                  onClick={onAddClient}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('cta.addNewClient')}
                </button>
              </div>
              {sortedClients.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-slate-600">
                    {t('orders.form.noClients')}
                  </p>
                  <button
                    type="button"
                    onClick={onAddClient}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {t('orders.form.createFirstClient')}
                  </button>
                </div>
              ) : (
                <select
                  id="orderClient"
                  required
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                >
                  <option value="">{t('orders.form.selectClient')}</option>
                  {sortedClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.clientName} — {client.companyName} ({client.mobile})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Order Date & Fabric Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label
                  htmlFor="orderDate"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {t('orders.form.orderDate')} <span className="text-red-600">*</span>
                </label>
                <input
                  id="orderDate"
                  type="date"
                  required
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>

              <div>
                <label
                  htmlFor="fabricType"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {t('orders.form.fabricType')} <span className="text-red-600">*</span>
                </label>
                <select
                  id="fabricType"
                  required
                  value={fabricType}
                  onChange={(e) => setFabricType(e.target.value as FabricType)}
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                >
                  {FABRIC_TYPES.map((fabric) => (
                    <option key={fabric} value={fabric}>
                      {fabric}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Grey Fabric Than, Grey Fabric Gaj, Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <label
                  htmlFor="greyFabricThan"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {t('orders.form.greyThan')} <span className="text-red-600">*</span>
                </label>
                <input
                  id="greyFabricThan"
                  type="number"
                  required
                  min="0.01"
                  max={ORDER_VALIDATION.maxThan}
                  step="0.01"
                  value={greyFabricThan}
                  onChange={(e) => setGreyFabricThan(e.target.value)}
                  placeholder="e.g. 12"
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>

              <div>
                <label
                  htmlFor="greyFabricGaj"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {t('orders.form.greyGaj')} <span className="text-red-600">*</span>
                </label>
                <input
                  id="greyFabricGaj"
                  type="number"
                  required
                  min="0.01"
                  max={ORDER_VALIDATION.maxGaj}
                  step="0.01"
                  value={greyFabricGaj}
                  onChange={(e) => setGreyFabricGaj(e.target.value)}
                  placeholder="e.g. 600"
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>

              <div>
                <label
                  htmlFor="orderRate"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {t('orders.form.ratePerGaj')} <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-500">
                    ৳
                  </span>
                  <input
                    id="orderRate"
                    type="number"
                    required
                    min="0.01"
                    max={ORDER_VALIDATION.maxRate}
                    step="0.01"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="e.g. 22.50"
                    className="w-full pl-8 pr-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                  />
                </div>
              </div>
            </div>

            {/* Status (defaults to Processing) */}
            <div>
              <label
                htmlFor="orderStatus"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                {t('orders.form.initialStatus')}
              </label>
              <select
                id="orderStatus"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as InProgressOrderStatus)
                }
                className="w-full sm:w-64 px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              >
                {IN_PROGRESS_ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {translateOrderStatus(s)}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-500">
                {t('orders.form.statusHelp')}
              </p>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || sortedClients.length === 0}
              className="px-5 py-2 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              {isSubmitting ? t('orders.form.creating') : t('orders.form.createOrder')}
            </button>
          </div>
        </form>

        {/* Right Live Summary Sidebar */}
        <aside className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              {t('orders.form.summaryTitle')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('orders.form.summarySub')}
            </p>
          </div>

          <dl className="divide-y divide-slate-200 text-sm">
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-xs text-slate-500">
                {t('orders.form.selectedClient')}
              </dt>
              <dd className="text-xs font-medium text-slate-900 text-right truncate max-w-[180px]">
                {selectedClient ? selectedClient.clientName : t('common.notSelected')}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-xs text-slate-500">
                {t('orders.form.fabricType')}
              </dt>
              <dd className="text-xs font-medium text-slate-900">{fabricType}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-xs text-slate-500">
                {t('orders.form.greyFabric')}
              </dt>
              <dd className="font-mono text-xs tabular-nums text-slate-900">
                {parsedThan > 0 ? `${formatNumber(parsedThan)} ${t('common.than')}` : '—'} ·{' '}
                {parsedGaj > 0 ? `${formatNumber(parsedGaj)} ${t('common.gaj')}` : '—'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-xs text-slate-500">
                {t('orders.form.avgGajThan')}
              </dt>
              <dd className="font-mono text-xs tabular-nums text-slate-700">
                {avgGajPerThan !== null
                  ? `${formatNumber(avgGajPerThan)} ${t('common.gaj')}`
                  : '—'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-xs text-slate-500">
                {t('orders.form.rateLabel')}
              </dt>
              <dd className="font-mono text-xs tabular-nums text-slate-900">
                {parsedRate > 0 ? formatCurrency(parsedRate) : '—'}
              </dd>
            </div>
            <div className="pt-4 flex items-baseline justify-between gap-4">
              <dt className="text-xs font-medium text-slate-700">
                {t('orders.form.estimatedBill')}
              </dt>
              <dd className="font-mono text-lg font-semibold tabular-nums text-slate-900">
                {estimatedBill !== null ? formatCurrency(estimatedBill) : '৳0.00'}
              </dd>
            </div>
          </dl>

          <p className="text-xs text-slate-500 leading-relaxed pt-3 border-t border-slate-200">
            Actual invoice billing is calculated when you run{' '}
            <span className="font-medium text-slate-700">Complete &amp; Deliver</span>{' '}
            using the measured <span className="font-mono text-slate-700">Final_Gaj</span>{' '}
            to account for dyeing/washing shrinkage or stretch.
          </p>
        </aside>
      </div>
    </div>
  );
}
