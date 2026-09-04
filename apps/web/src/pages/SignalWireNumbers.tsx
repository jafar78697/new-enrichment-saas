import { useState, useEffect } from 'react';
import { employeesApi } from '../services/employeesApi';
import CallLogsPage from './CallLogs';

interface PoolNumber {
  sid: string;
  phoneNumber: string;
  friendlyName?: string;
  assigned: { agent_id: number; name: string; email: string } | null;
}

export default function SignalWireNumbersPage() {
  const [pool, setPool] = useState<PoolNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadNumbers();
  }, []);

  const loadNumbers = async () => {
    try {
      setLoading(true);
      const response = await employeesApi.numbersPool();
      setPool(response.numbers || []);
    } catch (err: any) {
      console.error('Failed to load SignalWire numbers:', err);
      setError(err.message || 'Failed to load numbers from SignalWire');
    } finally {
      setLoading(false);
    }
  };

  const assignedCount = pool.filter(n => n.assigned).length;
  const unassignedCount = pool.filter(n => !n.assigned).length;

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <div style={{ textAlign: 'center', padding: 40, color: '#7B8794' }}>
          <div style={{ fontSize: 16 }}>Loading SignalWire numbers...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: 16 }}>
          <div style={{ color: '#991B1B', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            ⚠️ Error Loading SignalWire Numbers
          </div>
          <div style={{ color: '#7F1D1D', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
          <button
            onClick={loadNumbers}
            style={{
              background: '#DC2626',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 700, color: '#14202B', margin: '0 0 8px' }}>
            📞 SignalWire Numbers
          </h1>
          <p style={{ color: '#52606D', fontSize: 15, margin: 0 }}>
            View all purchased SignalWire phone numbers and their assignments
          </p>
        </div>
        
        <button
          onClick={loadNumbers}
          style={{
            background: '#0F766E',
            color: '#fff',
            border: 'none',
            padding: '12px 24px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Total Numbers</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#0F766E' }}>
            {pool.length}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Assigned</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#2563EB' }}>
            {assignedCount}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Unassigned (Pool)</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#F59E0B' }}>
            {unassignedCount}
          </div>
        </div>
      </div>

      {/* Numbers List */}
      {pool.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📱</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#14202B', marginBottom: 8 }}>
            No SignalWire Numbers Found
          </div>
          <div style={{ fontSize: 14, color: '#7B8794' }}>
            You haven't purchased any SignalWire numbers yet, or SignalWire credentials are not configured.
          </div>
          <div style={{ marginTop: 16, padding: 12, background: '#F3F4F6', borderRadius: 6, fontSize: 12, color: '#52606D' }}>
            <strong>Tip:</strong> Make sure your backend has TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN configured in the .env file.
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, overflow: 'hidden' }}>
          {/* Table Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 1fr', gap: 12, padding: '12px 16px', background: '#F6F7F2', borderBottom: '1px solid #D8E1D7', fontSize: 12, fontWeight: 600, color: '#52606D', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <div>Phone Number</div>
            <div>Friendly Name</div>
            <div>Assigned To</div>
            <div>Status</div>
          </div>

          {/* Numbers */}
          {pool.map((number, index) => (
            <div
              key={number.sid}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 2fr 2fr 1fr',
                gap: 12,
                padding: '14px 16px',
                borderTop: index > 0 ? '1px solid #EEF2EA' : 'none',
                background: number.assigned ? '#fff' : '#F0FDF4',
                alignItems: 'center',
              }}
            >
              <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: '#14202B' }}>
                {number.phoneNumber}
              </div>

              <div style={{ fontSize: 13, color: '#52606D' }}>
                {number.friendlyName || '—'}
              </div>

              <div>
                {number.assigned ? (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#14202B' }}>
                      {number.assigned.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#7B8794' }}>
                      {number.assigned.email}
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: '#F59E0B', fontStyle: 'italic' }}>
                    Not assigned
                  </span>
                )}
              </div>

              <div>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 600,
                    background: number.assigned ? '#DBEAFE' : '#D1FAE5',
                    color: number.assigned ? '#1E40AF' : '#065F46',
                  }}
                >
                  {number.assigned ? 'Assigned' : 'Available'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      {pool.length > 0 && (
        <div style={{ marginTop: 20, padding: 16, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8 }}>
          <div style={{ fontSize: 13, color: '#1E40AF' }}>
            <strong>ℹ️ About Number Pool:</strong>
            <br />
            • Numbers marked "Available" are not assigned to any employee and can be reassigned
            <br />
            • When you delete an employee, their number returns to the pool (not released from SignalWire)
            <br />
            • All numbers in this list are purchased and owned by your SignalWire account
          </div>
        </div>
      )}

      {/* Call Logs Section */}
      <div style={{ marginTop: 40, borderTop: '2px solid #D8E1D7', paddingTop: 40 }}>
        <CallLogsPage />
      </div>
    </div>
  );
}
