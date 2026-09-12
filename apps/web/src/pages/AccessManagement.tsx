import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { employeesApi, Employee } from '../services/employeesApi';

export default function AccessManagementPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ name: '', username: '' });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const res = await employeesApi.list();
      setEmployees(res.employees);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmployee = async () => {
    if (!newEmployee.name || !newEmployee.username) {
      toast.error('Please enter employee name and username');
      return;
    }
    try {
      setIsCreating(true);
      const res = await employeesApi.create({
        name: newEmployee.name,
        username: newEmployee.username,
      });
      toast.success(`Access granted to ${newEmployee.name}`);
      toast.info(`Generated Password: ${res.generatedPassword}`, {
        duration: 15000,
        description: "Please copy this password now, it won't be shown again!"
      });
      
      setShowAddForm(false);
      setNewEmployee({ name: '', username: '' });
      fetchEmployees();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create employee');
    } finally {
      setIsCreating(false);
    }
  };

  const handleResetPassword = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to reset password for ${name}?`)) return;
    try {
      const res = await employeesApi.resetPassword(id);
      toast.success('Password reset successful');
      toast.info(`New Password: ${res.generatedPassword}`, {
        duration: 15000,
        description: "Please copy this password now, it won't be shown again!"
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to reset password');
    }
  };

  const handleRevoke = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to revoke access for ${name}?`)) return;
    try {
      await employeesApi.remove(id);
      toast.success(`Revoked access for ${name}`);
      fetchEmployees();
    } catch (error: any) {
      toast.error(error.message || 'Failed to revoke access');
    }
  };

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 700, color: '#14202B', margin: '0 0 8px' }}>
            🔐 Access Management
          </h1>
          <p style={{ color: '#52606D', fontSize: 15, margin: 0 }}>
            Grant access to employees and manage permissions
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
          <div style={{ display: 'grid', gap: 12 }}>
            <input
              type="text"
              placeholder="Employee Name"
              value={newEmployee.name}
              onChange={(e) => setNewEmployee({...newEmployee, name: e.target.value})}
              style={{ padding: '10px 14px', border: '1px solid #D8E1D7', borderRadius: 8, fontSize: 14 }}
              disabled={isCreating}
            />
            <input
              type="text"
              placeholder="Username"
              value={newEmployee.username}
              onChange={(e) => setNewEmployee({...newEmployee, username: e.target.value})}
              style={{ padding: '10px 14px', border: '1px solid #D8E1D7', borderRadius: 8, fontSize: 14 }}
              disabled={isCreating}
            />
            <button
              onClick={handleAddEmployee}
              disabled={isCreating}
              style={{
                background: '#0F766E',
                color: '#fff',
                border: 'none',
                padding: '12px 24px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: isCreating ? 'not-allowed' : 'pointer',
                opacity: isCreating ? 0.7 : 1,
              }}
            >
              {isCreating ? 'Creating...' : 'Grant Access'}
            </button>
          </div>
        </div>
      )}

      {/* Employee List */}
      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F6F7F2', borderBottom: '2px solid #D8E1D7' }}>
              <th style={{ textAlign: 'left', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Employee</th>
              <th style={{ textAlign: 'center', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Role</th>
              <th style={{ textAlign: 'center', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Status</th>
              <th style={{ textAlign: 'center', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#7B8794' }}>Loading...</td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#7B8794' }}>No employees found.</td>
              </tr>
            ) : employees.map(emp => (
              <tr key={emp.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                <td style={{ padding: '16px' }}>
                  <div style={{ fontWeight: 600, color: '#14202B' }}>{emp.name}</div>
                  <div style={{ fontSize: 13, color: '#7B8794' }}>@{emp.username} {emp.email && `· ${emp.email}`}</div>
                </td>
                <td style={{ padding: '16px', textAlign: 'center' }}>
                  <span style={{
                    background: '#EEF2EA',
                    color: '#0F766E',
                    padding: '4px 12px',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    {emp.role || 'employee'}
                  </span>
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
                  <button 
                    onClick={() => handleResetPassword(emp.id, emp.name)}
                    style={{
                      background: 'none',
                      border: '1px solid #D8E1D7',
                      padding: '6px 16px',
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: 'pointer',
                      marginRight: 8,
                    }}
                  >
                    Reset Password
                  </button>
                  <button 
                    onClick={() => handleRevoke(emp.id, emp.name)}
                    style={{
                      background: '#FEE2E2',
                      border: 'none',
                      padding: '6px 16px',
                      borderRadius: 6,
                      fontSize: 13,
                      color: '#991B1B',
                      cursor: 'pointer',
                    }}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

