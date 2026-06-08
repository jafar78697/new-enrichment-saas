import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import employeesApi from '../services/employeesApi';

export default function AccessSystemPage() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ name: '', username: '' });
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  // Modal State
  const [modal, setModal] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm';
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  }>({ isOpen: false, type: 'alert', title: '', message: '' });

  const showAlert = (title: string, message: string) => {
    setModal({ isOpen: true, type: 'alert', title, message, confirmText: 'OK' });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, confirmText = 'Confirm') => {
    setModal({ isOpen: true, type: 'confirm', title, message, onConfirm, confirmText });
  };

  const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }));

  // Twilio state
  const [assigningEmpId, setAssigningEmpId] = useState<number | null>(null);
  const [assignmentMode, setAssignmentMode] = useState<'pool' | 'new' | ''>('');
  const [buyAreaCode, setBuyAreaCode] = useState('415');

  const { data: poolData } = useQuery({
    queryKey: ['twilio-pool'],
    queryFn: () => employeesApi.numbersPool()
  });

  const { data: employeesData, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => employeesApi.list()
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string, username: string }) => employeesApi.create(data),
    onSuccess: (data) => {
      setGeneratedPassword(data.generatedPassword);
      setNewEmployee({ name: '', username: '' });
      setShowAddForm(false);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err: any) => showAlert('Error', err.message || 'Failed to create employee')
  });

  const assignNumberMutation = useMutation({
    mutationFn: ({ empId, areaCode, twilioSid }: { empId: number, areaCode?: string, twilioSid?: string }) => 
      employeesApi.assignNumber(empId, areaCode ? { areaCode } : { twilioSid }),
    onSuccess: () => {
      setAssigningEmpId(null);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['twilio-pool'] });
      showAlert('Success', 'Twilio number successfully assigned!');
    },
    onError: (err: any) => showAlert('Error', err.message || 'Failed to assign number')
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => employeesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['twilio-pool'] });
    },
    onError: (err: any) => showAlert('Error', err.message || 'Failed to revoke access')
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (id: number) => employeesApi.resetPassword(id),
    onSuccess: (data) => {
      setGeneratedPassword(data.generatedPassword);
    },
    onError: (err: any) => showAlert('Error', err.message || 'Failed to reset password')
  });

  const employees = employeesData?.employees || [];
  const pool = poolData?.numbers || [];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 700, color: '#14202B', margin: '0 0 8px' }}>
            🔐 Access System
          </h1>
          <p style={{ color: '#52606D', fontSize: 15, margin: 0 }}>
            Manage employee access and purchase/assign Twilio phone numbers
          </p>
        </div>
        
        <button
          onClick={() => setShowAddForm(!showAddForm)}
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
          {showAddForm ? 'Cancel' : '+ Add Employee'}
        </button>
      </div>

      {generatedPassword && (
        <div style={{ background: '#ECFDF5', border: '1px solid #10B981', padding: 16, borderRadius: 8, marginBottom: 24 }}>
          <strong style={{ color: '#065F46' }}>Password Generated!</strong>
          <p style={{ margin: '8px 0', color: '#047857' }}>
            Please share this password with the employee. It will not be shown again:
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <code style={{ background: '#fff', padding: '8px 12px', borderRadius: 4, fontSize: 18, fontWeight: 'bold' }}>
              {generatedPassword}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(generatedPassword);
                showAlert('Copied', 'Password copied to clipboard!');
              }}
              style={{ background: '#10B981', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
            >
              Copy
            </button>
            <button onClick={() => setGeneratedPassword(null)} style={{ background: 'none', border: 'none', color: '#059669', cursor: 'pointer', textDecoration: 'underline' }}>Dismiss</button>
          </div>
        </div>
      )}

      {/* Add Employee Form */}
      {showAddForm && (
        <div style={{
          background: '#fff',
          border: '1px solid #D8E1D7',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Grant Access</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12 }}>
            <input
              type="text"
              placeholder="Employee Name"
              value={newEmployee.name}
              onChange={(e) => setNewEmployee({...newEmployee, name: e.target.value})}
              style={{ padding: '10px 14px', border: '1px solid #D8E1D7', borderRadius: 8, fontSize: 14 }}
            />
            <input
              type="text"
              placeholder="Username"
              value={newEmployee.username}
              onChange={(e) => setNewEmployee({...newEmployee, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')})}
              style={{ padding: '10px 14px', border: '1px solid #D8E1D7', borderRadius: 8, fontSize: 14 }}
            />
            <button
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate(newEmployee)}
              style={{
                background: '#0F766E',
                color: '#fff',
                border: 'none',
                padding: '12px 24px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: createMutation.isPending ? 0.7 : 1
              }}
            >
              {createMutation.isPending ? 'Saving...' : 'Grant Access'}
            </button>
          </div>
        </div>
      )}

      {/* Employee List */}
      <h3 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700, color: '#14202B' }}>Employees</h3>
      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, overflow: 'hidden', marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F6F7F2', borderBottom: '2px solid #D8E1D7' }}>
              <th style={{ textAlign: 'left', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Employee</th>
              <th style={{ textAlign: 'left', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Twilio Number</th>
              <th style={{ textAlign: 'center', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Status</th>
              <th style={{ textAlign: 'center', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#7B8794' }}>Loading...</td></tr>
            ) : employees.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#7B8794' }}>No employees found.</td></tr>
            ) : employees.map(emp => (
              <tr key={emp.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                <td style={{ padding: '16px' }}>
                  <div style={{ fontWeight: 600, color: '#14202B', fontSize: 15 }}>{emp.name}</div>
                  <div style={{ fontSize: 13, color: '#7B8794' }}>@{emp.username || emp.email.split('@')[0]}</div>
                </td>
                <td style={{ padding: '16px' }}>
                  {emp.twilio_phone_number ? (
                    <div>
                      <div style={{ fontWeight: 600, color: '#0F766E', fontFamily: 'monospace', fontSize: 15 }}>
                        {emp.twilio_phone_number}
                      </div>
                      <div style={{ fontSize: 11, color: '#7B8794' }}>
                        Purchased: {new Date(emp.twilio_phone_purchased_at).toLocaleDateString()}
                      </div>
                    </div>
                  ) : (
                    <div>
                      {assigningEmpId === emp.id ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <select 
                            value={assignmentMode}
                            onChange={(e) => {
                              const val = e.target.value as any;
                              setAssignmentMode(val);
                              if (val && val !== 'new') {
                                assignNumberMutation.mutate({ empId: emp.id, twilioSid: val });
                              }
                            }}
                            style={{ padding: '6px 10px', border: '1px solid #D8E1D7', borderRadius: 6, fontSize: 13 }}
                          >
                            <option value="">-- Select an option --</option>
                            <option value="new">+ Buy New Number</option>
                            {pool.length > 0 && (
                              <optgroup label="Available in Pool">
                                {pool.map(p => (
                                  <option key={p.sid} value={p.sid} disabled={!!p.assigned}>
                                    {p.phoneNumber} {p.assigned ? `(Assigned)` : ''}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                          
                          {assignmentMode === 'new' && (
                            <>
                              <input 
                                type="text" 
                                placeholder="Area Code (e.g. 415)" 
                                value={buyAreaCode}
                                onChange={e => setBuyAreaCode(e.target.value)}
                                style={{ width: 140, padding: '6px 10px', border: '1px solid #D8E1D7', borderRadius: 6, fontSize: 13 }}
                              />
                              <button 
                                disabled={assignNumberMutation.isPending}
                                onClick={() => assignNumberMutation.mutate({ empId: emp.id, areaCode: buyAreaCode })}
                                style={{ background: '#2563EB', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                              >
                                {assignNumberMutation.isPending ? 'Buying...' : 'Buy'}
                              </button>
                            </>
                          )}
                          <button 
                            onClick={() => {
                              setAssigningEmpId(null);
                              setAssignmentMode('');
                            }}
                            style={{ background: 'none', border: 'none', color: '#7B8794', fontSize: 12, cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAssigningEmpId(emp.id)}
                          style={{
                            background: '#F3F4F6',
                            color: '#4B5563',
                            border: '1px solid #D1D5DB',
                            padding: '6px 12px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          + Assign / Purchase Number
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td style={{ padding: '16px', textAlign: 'center' }}>
                  <span style={{
                    background: emp.status === 'active' ? '#D1FAE5' : '#FEE2E2',
                    color: emp.status === 'active' ? '#065F46' : '#991B1B',
                    padding: '4px 12px',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    {emp.status}
                  </span>
                </td>
                <td style={{ padding: '16px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button 
                      disabled={resetPasswordMutation.isPending}
                      onClick={() => {
                        showConfirm(
                          'Reset Password',
                          `Are you sure you want to reset the password for ${emp.name}? This will invalidate their current password.`,
                          () => resetPasswordMutation.mutate(emp.id),
                          'Reset Password'
                        );
                      }}
                      style={{
                        background: '#E0E7FF',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 13,
                        color: '#4338CA',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}>
                      Reset Password
                    </button>
                    <button 
                      disabled={revokeMutation.isPending}
                      onClick={() => {
                        showConfirm(
                          'Revoke Access',
                          `Are you sure you want to completely revoke access for ${emp.name}?`,
                          () => revokeMutation.mutate(emp.id),
                          'Revoke Access'
                        );
                      }}
                      style={{
                        background: '#FEE2E2',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 13,
                        color: '#991B1B',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}>
                      Revoke
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Twilio Numbers Pool */}
      <h3 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700, color: '#14202B' }}>Twilio Numbers Pool</h3>
      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F6F7F2', borderBottom: '2px solid #D8E1D7' }}>
              <th style={{ textAlign: 'left', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Phone Number</th>
              <th style={{ textAlign: 'left', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Assigned To</th>
            </tr>
          </thead>
          <tbody>
            {pool.length === 0 ? (
              <tr><td colSpan={3} style={{ padding: 24, textAlign: 'center', color: '#7B8794' }}>No numbers in pool.</td></tr>
            ) : pool.map(p => (
              <tr key={p.sid} style={{ borderBottom: '1px solid #E5E7EB' }}>
                <td style={{ padding: '16px', fontFamily: 'monospace', fontSize: 15, fontWeight: 600, color: '#14202B' }}>
                  {p.phoneNumber}
                </td>
                <td style={{ padding: '16px' }}>
                  <span style={{
                    background: p.assigned ? '#DBEAFE' : '#D1FAE5',
                    color: p.assigned ? '#1E40AF' : '#065F46',
                    padding: '4px 12px',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    {p.assigned ? 'Assigned' : 'Available'}
                  </span>
                </td>
                <td style={{ padding: '16px', color: '#52606D', fontSize: 14 }}>
                  {p.assigned ? `${p.assigned.name} (${p.assigned.email})` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Custom Modal */}
      {modal.isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: '#fff', padding: 32, borderRadius: 16, width: '100%', maxWidth: 400,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            transform: 'scale(1)', animation: 'slideUp 0.2s ease-out'
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 20, color: '#14202B', fontFamily: 'Space Grotesk, sans-serif' }}>
              {modal.title}
            </h3>
            <p style={{ margin: '0 0 24px', color: '#52606D', fontSize: 15, lineHeight: 1.5 }}>
              {modal.message}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              {modal.type === 'confirm' && (
                <button
                  onClick={closeModal}
                  style={{
                    background: '#F3F4F6', color: '#4B5563', border: 'none', padding: '10px 20px',
                    borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  {modal.cancelText || 'Cancel'}
                </button>
              )}
              <button
                onClick={() => {
                  if (modal.onConfirm) modal.onConfirm();
                  closeModal();
                }}
                style={{
                  background: modal.type === 'alert' ? '#0F766E' : '#E11D48',
                  color: '#fff', border: 'none', padding: '10px 20px',
                  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer'
                }}
              >
                {modal.confirmText || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
