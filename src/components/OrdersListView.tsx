import { useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Edit2,
  Lock,
  Plus,
  Printer,
  Search,
  Trash2,
  Truck,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  FABRIC_TYPES,
  IN_PROGRESS_ORDER_STATUSES,
  type ClientRecord,
  type ClientWithLedgerSummary,
  type FabricType,
  type InProgressOrderStatus,
  type OrderRecord,
} from '../types/mill';
import {
  formatCurrency,
  formatIsoDate,
  formatNumber,
  roundCurrency,
  timestampToDate,
} from '../utils/ledger';

type StatusFilter = 'all' | 'in_progress' | 'delivered';

interface OrdersListViewProps {
  orders: OrderRecord[];
  clientsById: Map<string, ClientRecord>;
  summariesByClientId: Map<string, ClientWithLedgerSummary>;
  isLoading: boolean;
  isAdmin: boolean;
  onCreateNewOrder: () => void;
  onEditOrder: (order: OrderRecord) => void;
  onDeleteOrder: (order: OrderRecord) => void;
  onStartCompleteDeliver: (order: OrderRecord) => void;
  onOpenClientLedger: (client: ClientRecord) => void;
  onPrintInvoice: (order: OrderRecord) => void;
  onPrintChallan: (order: OrderRecord) => void;
  onStatusUpdated: (message: string) => void;
}

export function OrdersListView({
  orders,
  clientsById,
  summariesByClientId,
  isLoading,
  isAdmin,
  onCreateNewOrder,
  onEditOrder,
  onDeleteOrder,
  onStartCompleteDeliver,
  onOpenClientLedger,
  onPrintInvoice,
  onPrintChallan,
  onStatusUpdated,
}: OrdersListViewProps) {
  const { t, translateOrderStatus } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [fabricFilter, setFabricFilter] = useState<string>('all');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const stats = useMemo(() => {
    let inProgressCount = 0;
    let deliveredCount = 0;
    let totalDeliveredBilling = 0;
    let activeGreyGaj = 0;

    for (const order of orders) {
      if (order.status === 'Delivered') {
        deliveredCount += 1;
        totalDeliveredBilling += order.finalBillAmount ?? 0;
      } else {
        inProgressCount += 1;
        activeGreyGaj += order.greyFabricGaj;
      }
    }

    return {
      totalOrders: orders.length,
      inProgressCount,
      deliveredCount,
      totalDeliveredBilling: roundCurrency(totalDeliveredBilling),
      activeGreyGaj: roundCurrency(activeGreyGaj),
    };
  }, [orders]);

  const sortedAndFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return [...orders]
      .sort((a, b) => {
        const timeA = timestampToDate(a.createdAt)?.getTime() ?? 0;
        const timeB = timestampToDate(b.createdAt)?.getTime() ?? 0;
        return timeB - timeA;
      })
      .filter((order) => {
        if (statusFilter === 'in_progress' && order.status === 'Delivered') return false;
        if (statusFilter === 'delivered' && order.status !== 'Delivered') return false;
        if (fabricFilter !== 'all' && order.fabricType !== (fabricFilter as FabricType)) {
          return false;
        }
        if (!q) return true;
        const client = clientsById.get(order.clientId);
        return (
          order.id.toLowerCase().includes(q) ||
          order.fabricType.toLowerCase().includes(q) ||
          order.status.toLowerCase().includes(q) ||
          order.orderDate.toLowerCase().includes(q) ||
          (client?.clientName.toLowerCase().includes(q) ?? false) ||
          (client?.companyName.toLowerCase().includes(q) ?? false)
        );
      });
  }, [orders, clientsById, searchQuery, statusFilter, fabricFilter]);

  const handleStageChange = async (
    order: OrderRecord,
    nextStatus: InProgressOrderStatus
  ) => {
    if (order.status === 'Delivered' || order.status === nextStatus) return;
    setUpdatingOrderId(order.id);
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      onStatusUpdated(`Updated ${order.id} status to ${nextStatus}.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">
            {t('orders.kpi.totalOrders')}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {isLoading ? '—' : stats.totalOrders}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('orders.kpi.totalOrdersSub')}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">
            {t('orders.kpi.inProgress')}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-amber-700">
            {isLoading ? '—' : stats.inProgressCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {formatNumber(stats.activeGreyGaj)} {t('orders.kpi.greyGajOnFloor')}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">
            {t('orders.kpi.deliveredOrders')}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-emerald-700">
            {isLoading ? '—' : stats.deliveredCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('orders.kpi.deliveredSub')}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">
            {t('orders.kpi.totalBilling')}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {isLoading ? '—' : formatCurrency(stats.totalDeliveredBilling)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('orders.kpi.billingSub')}
          </p>
        </div>
      </div>

      {/* Orders Table Card */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 sm:px-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('orders.searchPlaceholder')}
              aria-label="Search orders"
              className="w-full pl-9 pr-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:bg-white focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status Segmented Filter */}
            <div
              role="group"
              aria-label="Filter orders by status"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md"
            >
              {(
                [
                  { id: 'all', label: t('common.all') },
                  { id: 'in_progress', label: t('orders.filter.inProgress') },
                  { id: 'delivered', label: t('orders.filter.delivered') },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Fabric Filter */}
            <select
              aria-label="Filter by fabric type"
              value={fabricFilter}
              onChange={(e) => setFabricFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-[#1e3a8a] cursor-pointer"
            >
              <option value="all">{t('orders.filter.allFabrics')}</option>
              {FABRIC_TYPES.map((fabric) => (
                <option key={fabric} value={fabric}>
                  {fabric}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table Body / Empty / Loading */}
        {isLoading ? (
          <div className="divide-y divide-slate-200">
            {[1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="px-5 py-4 flex items-center justify-between gap-4 animate-pulse"
              >
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-44 bg-slate-200 rounded" />
                  <div className="h-3 w-64 bg-slate-100 rounded" />
                </div>
                <div className="h-4 w-24 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="w-11 h-11 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mx-auto mb-4">
              <ClipboardList className="w-5 h-5" />
            </div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              {t('orders.empty.title')}
            </h3>
            <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
              {t('orders.empty.desc')}
            </p>
            <button
              type="button"
              onClick={onCreateNewOrder}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              {t('orders.empty.cta')}
            </button>
          </div>
        ) : sortedAndFiltered.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <p className="text-sm font-medium text-slate-900">
              {t('orders.empty.noMatch')}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setFabricFilter('all');
              }}
              className="mt-4 px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
            >
              {t('common.clearFilters')}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-medium text-slate-600">
                  <th className="py-3 px-5">{t('orders.table.orderIdDate')}</th>
                  <th className="py-3 px-4">{t('orders.table.client')}</th>
                  <th className="py-3 px-4">{t('orders.table.fabricType')}</th>
                  <th className="py-3 px-4 text-right">
                    {t('orders.table.greyIntake')}
                  </th>
                  <th className="py-3 px-4 text-right">
                    {t('orders.table.finalGaj')}
                  </th>
                  <th className="py-3 px-4 text-right">
                    {t('orders.table.rateBill')}
                  </th>
                  <th className="py-3 px-4">{t('common.status')}</th>
                  <th className="py-3 px-5 text-right">{t('common.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {sortedAndFiltered.map((order) => {
                  const client = clientsById.get(order.clientId);
                  const clientSummary = summariesByClientId.get(order.clientId);
                  const isDelivered = order.status === 'Delivered';
                  const estBill = roundCurrency(order.greyFabricGaj * order.rate);
                  const variance =
                    order.finalGaj !== null
                      ? roundCurrency(order.finalGaj - order.greyFabricGaj)
                      : null;

                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <p className="font-mono text-xs font-semibold text-slate-900">
                          {order.id}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatIsoDate(order.orderDate)}
                        </p>
                      </td>

                      <td className="py-3.5 px-4">
                        {client ? (
                          <button
                            type="button"
                            onClick={() => onOpenClientLedger(client)}
                            className="text-left group cursor-pointer"
                          >
                            <p className="font-medium text-slate-900 group-hover:text-[#1e3a8a] transition-colors">
                              {client.clientName}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {client.companyName}
                              {clientSummary ? (
                                <>
                                  {' '}
                                  · {t('common.due')}:{' '}
                                  <span
                                    className={`font-mono tabular-nums ${
                                      clientSummary.currentDue > 0
                                        ? 'text-red-700 font-medium'
                                        : 'text-slate-600'
                                    }`}
                                  >
                                    {formatCurrency(clientSummary.currentDue)}
                                  </span>
                                </>
                              ) : null}
                            </p>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">
                            {t('common.client')}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-900">
                          {order.fabricType}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        <p className="text-slate-900 font-medium">
                          {formatNumber(order.greyFabricGaj)} {t('common.gaj')}
                        </p>
                        <p className="text-slate-500 mt-0.5">
                          {formatNumber(order.greyFabricThan)} {t('common.than')}
                        </p>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        {order.finalGaj !== null ? (
                          <>
                            <p className="text-slate-900 font-semibold">
                              {formatNumber(order.finalGaj)} {t('common.gaj')}
                            </p>
                            {variance !== null && (
                              <p
                                className={`mt-0.5 text-[11px] ${
                                  variance < 0
                                    ? 'text-amber-700'
                                    : variance > 0
                                      ? 'text-blue-700'
                                      : 'text-slate-500'
                                }`}
                              >
                                {variance > 0 ? '+' : ''}
                                {formatNumber(variance)} {t('common.gaj')}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-400">
                            {t('common.pending')}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        {isDelivered && order.finalBillAmount !== null ? (
                          <>
                            <p className="text-sm font-semibold text-slate-900">
                              {formatCurrency(order.finalBillAmount)}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              @ {formatCurrency(order.rate)}/{t('common.gaj')} ·{' '}
                              {t('orders.billed')}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-slate-700">
                              {formatCurrency(estBill)}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              @ {formatCurrency(order.rate)}/{t('common.gaj')} ·{' '}
                              {t('orders.est')}
                            </p>
                          </>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isDelivered ? (
                          <div>
                            <p className="text-xs font-semibold text-emerald-700">
                              {translateOrderStatus('Delivered')}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {t('orders.invoicePosted')}
                            </p>
                          </div>
                        ) : (
                          <select
                            aria-label={`Change production status for ${order.id}`}
                            value={order.status}
                            disabled={updatingOrderId === order.id}
                            onChange={(e) =>
                              handleStageChange(
                                order,
                                e.target.value as InProgressOrderStatus
                              )
                            }
                            className="text-xs font-medium text-amber-800 bg-amber-50/70 border border-amber-200 rounded-md px-2 py-1 focus:outline-none focus:border-[#1e3a8a] cursor-pointer disabled:opacity-50"
                          >
                            {IN_PROGRESS_ORDER_STATUSES.map((stage) => (
                              <option key={stage} value={stage}>
                                {translateOrderStatus(stage)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>

                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {isDelivered ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onPrintInvoice(order)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <Printer className="w-3.5 h-3.5 shrink-0" />
                                {t('common.printInvoice')}
                              </button>
                              <button
                                type="button"
                                onClick={() => onPrintChallan(order)}
                                title={t('common.challan')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <Truck className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                                {t('common.challan')}
                              </button>
                              {client ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenClientLedger(client)}
                                  title={t('common.ledger')}
                                  className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#1e3a8a] bg-blue-50/70 hover:bg-blue-100/80 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  <BookOpen className="w-3.5 h-3.5" />
                                  {t('common.ledger')}
                                </button>
                              ) : null}
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onStartCompleteDeliver(order)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              {t('orders.completeDeliver')}
                            </button>
                          )}

                          {/* Edit & Delete — Visible ONLY to Admin, enabled ONLY when order.status === 'Processing' */}
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                disabled={order.status !== 'Processing'}
                                onClick={() => onEditOrder(order)}
                                aria-label={`Edit order ${order.id}`}
                                title={
                                  order.status === 'Processing'
                                    ? 'Edit Order'
                                    : 'Only orders in "Processing" status can be edited'
                                }
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {order.status === 'Processing' ? (
                                  <Edit2 className="w-3.5 h-3.5" />
                                ) : (
                                  <Lock className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={order.status !== 'Processing'}
                                onClick={() => onDeleteOrder(order)}
                                aria-label={`Delete order ${order.id}`}
                                title={
                                  order.status === 'Processing'
                                    ? 'Delete Order'
                                    : 'Only orders in "Processing" status can be deleted'
                                }
                                className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
