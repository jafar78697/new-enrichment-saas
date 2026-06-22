import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import employeesApi from '../services/employeesApi';
import { nichesApi } from '../services/nichesApi';

const ALL_MODULES = [
  { key: 'email', label: 'Email', color: '#4F46E5', bg: '#EEF2FF' },
  { key: 'facebook', label: 'FB/IG', color: '#1877F2', bg: '#E7F3FF' },
  { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2', bg: '#EBF4FF' },
  { key: 'reddit', label: 'Reddit', color: '#FF4500', bg: '#FFEBE5' },
  { key: 'reels', label: 'Reels', color: '#E1306C', bg: '#FDF0F5' },
  { key: 'youtube', label: 'YouTube', color: '#FF0000', bg: '#FFE5E5' },
  { key: 'scraping', label: 'Scraping', color: '#0F766E', bg: '#E6F4F1' },
];

export default function AccessSystemPage() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmployee, setNewEmployee] = useState<{ name: string; username: string; nicheIds: number[] }>({ name: '', username: '', nicheIds: [] });
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

  // Edit Access Modal States
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const [editModules, setEditModules] = useState<string[]>([]);
  const [editNiches, setEditNiches] = useState<number[]>([]);
  const [showModulesDropdown, setShowModulesDropdown] = useState(false);
  const [showNichesDropdown, setShowNichesDropdown] = useState(false);

  const { data: poolData } = useQuery({
    queryKey: ['twilio-pool'],
    queryFn: () => employeesApi.numbersPool()
  });

  const { data: employeesData, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => employeesApi.list()
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string, username: string, nicheIds?: number[] }) => employeesApi.create(data),
    onSuccess: (data) => {
      setGeneratedPassword(data.generatedPassword);
      setNewEmployee({ name: '', username: '', nicheIds: [] });
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

  const toggleModuleMutation = useMutation({
    mutationFn: ({ empId, modules }: { empId: number; modules: string[] }) =>
      employeesApi.assignModules(empId, modules),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err: any) => showAlert('Error', err.message || 'Failed to update modules')
  });

  const handleToggleModule = (empId: number, moduleKey: string, isAssigned: boolean) => {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    const currentModules = emp.assigned_modules || [];
    const newModules = isAssigned
      ? currentModules.filter(m => m !== moduleKey)
      : [...currentModules, moduleKey];

    toggleModuleMutation.mutate({ empId, modules: newModules });
  };

  const { data: nichesData } = useQuery({
    queryKey: ['niches'],
    queryFn: () => nichesApi.list()
  });
  const niches = nichesData?.niches || [];

  const toggleNicheMutation = useMutation({
    mutationFn: ({ empId, nicheIds }: { empId: number; nicheIds: number[] }) =>
      employeesApi.assignNiches(empId, nicheIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err: any) => showAlert('Error', err.message || 'Failed to update niches')
  });

  const handleToggleNiche = (empId: number, nicheId: number, isAssigned: boolean) => {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    const currentNiches = emp.assigned_niches || [];
    const currentNicheIds = currentNiches.map(n => n.id);
    const newNicheIds = isAssigned
      ? currentNicheIds.filter(id => id !== nicheId)
      : [...currentNicheIds, nicheId];

    toggleNicheMutation.mutate({ empId, nicheIds: newNicheIds });
  };

  const saveAccessMutation = useMutation({
    mutationFn: async ({ empId, modules, nicheIds }: { empId: number; modules: string[]; nicheIds: number[] }) => {
      await employeesApi.assignModules(empId, modules);
      await employeesApi.assignNiches(empId, nicheIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setEditingEmployee(null);
      showAlert('Success', 'Access permissions saved successfully!');
    },
    onError: (err: any) => showAlert('Error', err.message || 'Failed to save access permissions')
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            </div>

            {niches.length > 0 && (
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#52606D', marginBottom: 8 }}>
                  Assign Initial Niches:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {niches.map(niche => {
                    const isSelected = newEmployee.nicheIds.includes(niche.id);
                    return (
                      <button
                        key={niche.id}
                        type="button"
                        onClick={() => {
                          const newIds = isSelected
                            ? newEmployee.nicheIds.filter(id => id !== niche.id)
                            : [...newEmployee.nicheIds, niche.id];
                          setNewEmployee({ ...newEmployee, nicheIds: newIds });
                        }}
                        style={{
                          border: isSelected ? '1px solid #0F766E' : '1px solid #D8E1D7',
                          background: isSelected ? '#E6F4F1' : '#fff',
                          color: isSelected ? '#0F766E' : '#7B8794',
                          padding: '6px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {niche.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
              <th style={{ textAlign: 'left', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Modules</th>
              <th style={{ textAlign: 'left', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Niches</th>
              <th style={{ textAlign: 'center', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Status</th>
              <th style={{ textAlign: 'center', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#7B8794' }}>Loading...</td></tr>
            ) : employees.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#7B8794' }}>No employees found.</td></tr>
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
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(emp.assigned_modules || []).length === 0 ? (
                      <span style={{ fontSize: 12, color: '#9CA3AF' }}>No modules</span>
                    ) : (emp.assigned_modules || []).map(modKey => {
                      const mod = ALL_MODULES.find(m => m.key === modKey);
                      if (!mod) return null;
                      return (
                        <span
                          key={modKey}
                          style={{
                            border: `1px solid ${mod.color}`,
                            background: mod.bg,
                            color: mod.color,
                            padding: '4px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {mod.label}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(emp.assigned_niches || []).length === 0 ? (
                      <span style={{ fontSize: 12, color: '#9CA3AF' }}>No niches</span>
                    ) : (emp.assigned_niches || []).map(niche => (
                      <span
                        key={niche.id}
                        style={{
                          border: '1px solid #0F766E',
                          background: '#E6F4F1',
                          color: '#0F766E',
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {niche.name}
                      </span>
                    ))}
                  </div>
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
                      onClick={() => {
                        setEditingEmployee(emp);
                        setEditModules(emp.assigned_modules || []);
                        setEditNiches((emp.assigned_niches || []).map(n => n.id));
                        setShowModulesDropdown(false);
                        setShowNichesDropdown(false);
                      }}
                      style={{
                        background: '#EEF2EA',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 13,
                        color: '#0F766E',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}>
                      Edit Access
                    </button>
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
      {/* Edit Access Modal */}
      {editingEmployee && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: '#fff', padding: 32, borderRadius: 16, width: '100%', maxWidth: 450,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            transform: 'scale(1)', animation: 'slideUp 0.2s ease-out'
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 20, color: '#14202B', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700 }}>
              Edit Access - {editingEmployee.name}
            </h3>
            <p style={{ margin: '0 0 20px', color: '#52606D', fontSize: 14 }}>
              Configure assigned modules and niches for this employee.
            </p>

            {/* Modules Multi-Select Dropdown */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#52606D', marginBottom: 8 }}>
                Select Modules:
              </label>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowModulesDropdown(!showModulesDropdown)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #D8E1D7',
                    borderRadius: 8,
                    fontSize: 14,
                    background: '#fff',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ color: editModules.length ? '#14202B' : '#7B8794' }}>
                    {editModules.length ? `${editModules.length} selected` : 'Select modules...'}
                  </span>
                  <span>▼</span>
                </button>
                {showModulesDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '105%',
                    left: 0,
                    right: 0,
                    background: '#fff',
                    border: '1px solid #D8E1D7',
                    borderRadius: 8,
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
                    zIndex: 10,
                    maxHeight: 200,
                    overflowY: 'auto',
                    padding: 8
                  }}>
                    {ALL_MODULES.map(mod => {
                      const isSelected = editModules.includes(mod.key);
                      return (
                        <div
                          key={mod.key}
                          onClick={() => {
                            setEditModules(prev => prev.includes(mod.key) ? prev.filter(k => k !== mod.key) : [...prev, mod.key]);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 12px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: isSelected ? '#F3F4F6' : 'transparent',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#F3F4F6'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? '#F3F4F6' : 'transparent'; }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#14202B' }}>{mod.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Selected Modules Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {editModules.map(key => {
                  const mod = ALL_MODULES.find(m => m.key === key);
                  if (!mod) return null;
                  return (
                    <span
                      key={key}
                      style={{
                        background: mod.bg,
                        color: mod.color,
                        padding: '4px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      {mod.label}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditModules(prev => prev.filter(k => k !== key));
                        }}
                        style={{ cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        ×
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Niches Multi-Select Dropdown */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#52606D', marginBottom: 8 }}>
                Select Niches:
              </label>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowNichesDropdown(!showNichesDropdown)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #D8E1D7',
                    borderRadius: 8,
                    fontSize: 14,
                    background: '#fff',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ color: editNiches.length ? '#14202B' : '#7B8794' }}>
                    {editNiches.length ? `${editNiches.length} selected` : 'Select niches...'}
                  </span>
                  <span>▼</span>
                </button>
                {showNichesDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '105%',
                    left: 0,
                    right: 0,
                    background: '#fff',
                    border: '1px solid #D8E1D7',
                    borderRadius: 8,
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
                    zIndex: 10,
                    maxHeight: 200,
                    overflowY: 'auto',
                    padding: 8
                  }}>
                    {niches.length === 0 ? (
                      <div style={{ padding: '8px 12px', fontSize: 13, color: '#7B8794' }}>No niches created yet</div>
                    ) : niches.map(niche => {
                      const isSelected = editNiches.includes(niche.id);
                      return (
                        <div
                          key={niche.id}
                          onClick={() => {
                            setEditNiches(prev => prev.includes(niche.id) ? prev.filter(id => id !== niche.id) : [...prev, niche.id]);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 12px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: isSelected ? '#F3F4F6' : 'transparent',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#F3F4F6'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? '#F3F4F6' : 'transparent'; }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#14202B' }}>{niche.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Selected Niches Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {editNiches.map(id => {
                  const niche = niches.find(n => n.id === id);
                  if (!niche) return null;
                  return (
                    <span
                      key={id}
                      style={{
                        background: '#E6F4F1',
                        color: '#0F766E',
                        border: '1px solid #0F766E',
                        padding: '4px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      {niche.name}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditNiches(prev => prev.filter(nId => nId !== id));
                        }}
                        style={{ cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        ×
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingEmployee(null)}
                style={{
                  background: '#F3F4F6', color: '#4B5563', border: 'none', padding: '10px 20px',
                  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                disabled={saveAccessMutation.isPending}
                onClick={() => saveAccessMutation.mutate({ empId: editingEmployee.id, modules: editModules, nicheIds: editNiches })}
                style={{
                  background: '#0F766E',
                  color: '#fff', border: 'none', padding: '10px 20px',
                  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  opacity: saveAccessMutation.isPending ? 0.7 : 1
                }}
              >
                {saveAccessMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

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
