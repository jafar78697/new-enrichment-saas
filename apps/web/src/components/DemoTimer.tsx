import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DemoTimer({ callUser }: { callUser: any }) {
  const navigate = useNavigate();
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!callUser || callUser.plan !== 'demo' || !callUser.tenant_created_at) {
      return;
    }

    const createdAt = new Date(callUser.tenant_created_at).getTime();
    const expiryTime = createdAt + 60 * 60 * 1000; // 1 hour

    const updateTimer = () => {
      const now = Date.now();
      const diff = expiryTime - now;

      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft('00:00');
      } else {
        const minutes = Math.floor(diff / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [callUser]);

  if (!callUser || callUser.plan !== 'demo') {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 12px',
      background: isExpired ? '#FEE2E2' : '#FEF3C7',
      color: isExpired ? '#991B1B' : '#92400E',
      borderRadius: '8px',
      fontWeight: 600,
      fontSize: '14px',
      border: `1px solid ${isExpired ? '#F87171' : '#FCD34D'}`
    }}>
      <Clock size={16} />
      <span>{isExpired ? 'Demo Expired' : `Demo expires in ${timeLeft}`}</span>
      {isExpired && (
        <button 
          onClick={() => navigate('/settings')}
          style={{
            marginLeft: '8px',
            padding: '4px 8px',
            background: '#EF4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 700
          }}
        >
          Upgrade
        </button>
      )}
    </div>
  );
}
