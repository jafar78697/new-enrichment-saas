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
  const color = pct > 80 ? 'bg-red-500' : 'bg-yellow-400';
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

  const portalMutation = useMutation({
    mutationFn: () => billingApi.portal().then(r => { window.location.href = r.data.url; }),
  });

  const currentPlan = plan?.plan || 'starter';
  const hasSubscription = !!plan?.ls_subscription_id;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-text-primary">Billing & Usage</h1>
        {hasSubscription && (
          <button
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
            className="text-sm text-brand-primary underline hover:no-underline"
          >
            {portalMutation.isPending ? 'Loading...' : 'Manage Subscription →'}
          </button>
        )}
      </div>

      {/* Success banner */}
      {new URLSearchParams(window.location.search).get('success') && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-800 text-sm">
          🎉 Payment successful! Your plan has been updated.
        </div>
      )}

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
            <div key={p.id} className={`bg-surface border rounded-xl p-4 ${currentPlan === p.id ? 'border-yellow-400 ring-1 ring-yellow-400' : 'border-border-soft'}`}>
              <p className="font-heading font-bold text-text-primary">{p.label}</p>
              <p className="text-2xl font-mono font-bold text-yellow-500 mt-1">{p.price}</p>
              <div className="mt-3 space-y-1 text-xs text-text-secondary">
                <p>{p.http} HTTP enrichments</p>
                <p>{p.credits} browser credits</p>
              </div>
              {currentPlan !== p.id && (
                <button
                  onClick={() => checkoutMutation.mutate({ plan: p.id })}
                  disabled={checkoutMutation.isPending}
                  className="mt-3 w-full text-xs bg-yellow-400 hover:bg-yellow-500 text-black font-semibold py-1.5 rounded-lg transition-colors"
                >
                  {checkoutMutation.isPending ? '...' : 'Upgrade'}
                </button>
              )}
              {currentPlan === p.id && (
                <p className="mt-3 text-xs text-yellow-500 font-medium text-center">Current Plan</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Credit Packs */}
      <div>
        <p className="font-heading font-semibold text-text-primary mb-1">Buy Browser Credit Packs</p>
        <p className="text-xs text-text-muted mb-3">One-time purchase, no subscription needed</p>
        <div className="flex gap-3">
          {CREDIT_PACKS.map(pack => (
            <button
              key={pack.credits}
              onClick={() => checkoutMutation.mutate({ credits: pack.credits })}
              disabled={checkoutMutation.isPending}
              className="flex-1 bg-surface border border-border-soft rounded-xl p-4 text-center hover:border-yellow-400 transition-colors"
            >
              <p className="font-mono font-bold text-text-primary text-lg">{pack.credits}</p>
              <p className="text-xs text-text-muted">credits</p>
              <p className="text-sm font-semibold text-yellow-500 mt-1">{pack.price}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Powered by */}
      <p className="text-xs text-text-muted text-center">
        Payments securely processed by{' '}
        <a href="https://lemonsqueezy.com" target="_blank" rel="noreferrer" className="underline hover:text-text-primary">
          Lemon Squeezy
        </a>
      </p>
    </div>
  );
}
