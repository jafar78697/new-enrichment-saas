import { useQuery, useMutation } from '@tanstack/react-query';
import { billingApi } from '../services/api';

const PLANS = [
  { id: 'starter', label: 'Starter', price: '$19/mo', http: '5,000', credits: '100' },
  { id: 'growth', label: 'Growth', price: '$49/mo', http: '25,000', credits: '500' },
  { id: 'pro', label: 'Pro', price: '$149/mo', http: '100,000', credits: '2,000' },
];

const CREDIT_PACKS = [
  { credits: 100, price: '$19' },
  { credits: 500, price: '$79' },
  { credits: 1000, price: '$139' },
];

function UsageBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color = pct > 80 ? 'bg-signal' : 'bg-brand-primary';
  return (
    <div>
      <div className="flex justify-between text-xs text-text-secondary mb-1">
        <span>{label}</span>
        <span className="font-mono">{used.toLocaleString()} / {total.toLocaleString()}</span>
      </div>
      <div className="w-full bg-subtle rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { data: usage } = useQuery({ queryKey: ['billing-usage'], queryFn: () => billingApi.getUsage().then(r => r.data) });
  const { data: plan } = useQuery({ queryKey: ['billing-plan'], queryFn: () => billingApi.getPlan().then(r => r.data) });

  const checkoutMutation = useMutation({
    mutationFn: (data: any) => billingApi.checkout(data).then(r => { window.location.href = r.data.url; }),
  });

  const currentPlan = plan?.plan || 'starter';

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-heading text-2xl font-bold text-text-primary">Billing & Usage</h1>

      {/* Current Usage */}
      <div className="bg-surface border border-border-soft rounded-xl p-5 space-y-4">
        <p className="font-heading font-semibold text-text-primary">Current Period Usage</p>
        <UsageBar used={usage?.http_enrichments_used ?? 0} total={usage?.http_limit ?? 5000} label="HTTP Enrichments" />
        <UsageBar used={usage?.browser_credits_used ?? 0} total={(usage?.browser_credits_used ?? 0) + (usage?.browser_credits_remaining ?? 100)} label="Browser Credits" />
        <p className="text-xs text-text-muted">{usage?.browser_credits_remaining ?? 0} browser credits remaining</p>
      </div>

      {/* Plans */}
      <div>
        <p className="font-heading font-semibold text-text-primary mb-3">Plans</p>
        <div className="grid grid-cols-3 gap-3">
          {PLANS.map(p => (
            <div key={p.id} className={`bg-surface border rounded-xl p-4 ${currentPlan === p.id ? 'border-brand-primary ring-1 ring-brand-primary' : 'border-border-soft'}`}>
              <p className="font-heading font-bold text-text-primary">{p.label}</p>
              <p className="text-2xl font-mono font-bold text-brand-primary mt-1">{p.price}</p>
              <div className="mt-3 space-y-1 text-xs text-text-secondary">
                <p>{p.http} HTTP enrichments</p>
                <p>{p.credits} browser credits</p>
              </div>
              {currentPlan !== p.id && (
                <button className="mt-3 w-full text-xs bg-brand-primary text-white py-1.5 rounded-lg hover:bg-brand-hover">
                  Upgrade
                </button>
              )}
              {currentPlan === p.id && (
                <p className="mt-3 text-xs text-brand-primary font-medium text-center">Current Plan</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Credit Packs */}
      <div>
        <p className="font-heading font-semibold text-text-primary mb-3">Buy Browser Credit Packs</p>
        <div className="flex gap-3">
          {CREDIT_PACKS.map(pack => (
            <button key={pack.credits} onClick={() => checkoutMutation.mutate({ credits: pack.credits, amount: parseInt(pack.price.replace('$', '')) * 100 })}
              className="flex-1 bg-surface border border-border-soft rounded-xl p-4 text-center hover:border-brand-primary transition-colors">
              <p className="font-mono font-bold text-text-primary text-lg">{pack.credits}</p>
              <p className="text-xs text-text-muted">credits</p>
              <p className="text-sm font-semibold text-brand-primary mt-1">{pack.price}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
