'use client';

import { OperationManifestEntry } from '@/lib/composer-api';
import {
  ArrowLeftRight,
  ArrowRightLeft,
  BarChart2,
  Coins,
  Database,
  Droplets,
  GitMerge,
  Key,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  UserPlus,
  Archive,
} from 'lucide-react';

const OP_ICONS: Record<string, React.ElementType> = {
  payment: Send,
  create_account: UserPlus,
  change_trust: ShieldCheck,
  manage_sell_offer: BarChart2,
  manage_buy_offer: BarChart2,
  create_passive_sell_offer: RefreshCw,
  set_options: Settings,
  account_merge: GitMerge,
  allow_trust: Key,
  path_payment_strict_send: ArrowRightLeft,
  path_payment_strict_receive: ArrowLeftRight,
  manage_data: Database,
  liquidity_pool_deposit: Droplets,
  liquidity_pool_withdraw: Droplets,
  create_claimable_balance: Coins,
  claim_claimable_balance: Archive,
};

const OP_COLORS: Record<string, string> = {
  payment: 'from-violet-600/20 to-violet-600/5 border-violet-500/30 text-violet-400',
  create_account: 'from-emerald-600/20 to-emerald-600/5 border-emerald-500/30 text-emerald-400',
  change_trust: 'from-sky-600/20 to-sky-600/5 border-sky-500/30 text-sky-400',
  manage_sell_offer: 'from-amber-600/20 to-amber-600/5 border-amber-500/30 text-amber-400',
  manage_buy_offer: 'from-orange-600/20 to-orange-600/5 border-orange-500/30 text-orange-400',
  create_passive_sell_offer: 'from-yellow-600/20 to-yellow-600/5 border-yellow-500/30 text-yellow-400',
  set_options: 'from-slate-600/20 to-slate-600/5 border-slate-500/30 text-slate-400',
  account_merge: 'from-rose-600/20 to-rose-600/5 border-rose-500/30 text-rose-400',
  allow_trust: 'from-lime-600/20 to-lime-600/5 border-lime-500/30 text-lime-400',
  path_payment_strict_send: 'from-cyan-600/20 to-cyan-600/5 border-cyan-500/30 text-cyan-400',
  path_payment_strict_receive: 'from-teal-600/20 to-teal-600/5 border-teal-500/30 text-teal-400',
  manage_data: 'from-indigo-600/20 to-indigo-600/5 border-indigo-500/30 text-indigo-400',
  liquidity_pool_deposit: 'from-teal-600/20 to-teal-600/5 border-teal-500/30 text-teal-400',
  liquidity_pool_withdraw: 'from-cyan-600/20 to-cyan-600/5 border-cyan-500/30 text-cyan-400',
  create_claimable_balance: 'from-fuchsia-600/20 to-fuchsia-600/5 border-fuchsia-500/30 text-fuchsia-400',
  claim_claimable_balance: 'from-purple-600/20 to-purple-600/5 border-purple-500/30 text-purple-400',
};

interface OperationPaletteProps {
  operations: OperationManifestEntry[];
  onAdd: (opType: string) => void;
}

export function OperationPalette({ operations, onAdd }: OperationPaletteProps) {
  return (
    <aside className="flex flex-col gap-1.5 h-full overflow-y-auto pr-1">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 px-1">
        Operations
      </p>
      {operations.map((op) => {
        const Icon = OP_ICONS[op.type] ?? Plus;
        const color = OP_COLORS[op.type] ?? 'from-slate-600/20 to-slate-600/5 border-slate-500/30 text-slate-400';
        return (
          <button
            key={op.type}
            id={`palette-op-${op.type}`}
            onClick={() => onAdd(op.type)}
            title={op.description}
            className={`group flex items-center gap-2.5 w-full rounded-lg border bg-gradient-to-br px-3 py-2.5 text-left transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20 active:scale-[0.98] ${color}`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
            <span className="text-xs font-medium text-foreground/90 leading-tight">
              {op.label}
            </span>
            <Plus className="ml-auto h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
          </button>
        );
      })}
    </aside>
  );
}

export { OP_COLORS, OP_ICONS };
