import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

export default function Analytics({ balances, positions }: { balances: any[], positions: any[] }) {
  // Filter non-zero balances
  const activeBalances = balances.filter(b => parseFloat(b.balance) > 0);
  
  const balanceData = activeBalances.map(b => ({
    name: b.asset_symbol,
    value: parseFloat(b.balance)
  }));

  const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Account Balances</h3>
          {balanceData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={balanceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {balanceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => value.toFixed(4)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              No balance data available
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Active Positions</h3>
          {positions.length > 0 ? (
            <div className="space-y-4">
              {positions.map(pos => (
                <div key={pos.id || pos.symbol} className="flex justify-between items-center p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <div>
                    <div className="font-bold text-slate-700">{pos.symbol}</div>
                    <div className="text-xs text-slate-500 mt-1">Size: {pos.size}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${parseFloat(pos.unrealized_pnl || pos.pnl || '0') >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {parseFloat(pos.unrealized_pnl || pos.pnl || '0') >= 0 ? '+' : ''}
                      {parseFloat(pos.unrealized_pnl || pos.pnl || '0').toFixed(2)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Entry: {pos.entry_price || '0.00'}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              No active positions
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
