import { useState } from 'react';
import { toast } from 'sonner';

const employees = [
  { id: 1, name: 'John Doe', email: 'john@example.com', role: 'SDR', status: 'active' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'SDR', status: 'active' },
];

export default function AccessManagementPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ name: '', email: '', role: 'SDR' });

  const handleAddEmployee = () => {
    if (!newEmployee.email) {
      toast.error('Please enter employee email');
      return;
    }
    toast.error(`Access granted to ${newEmployee.email} with role: ${newEmployee.role}`);
    setShowAddForm(false);
    setNewEmployee({ name: '', email: '', role: 'SDR' });
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
          + Add Employee
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
            />
            <input
              type="email"
              placeholder="Email Address"
              value={newEmployee.email}
              onChange={(e) => setNewEmployee({...newEmployee, email: e.target.value})}
              style={{ padding: '10px 14px', border: '1px solid #D8E1D7', borderRadius: 8, fontSize: 14 }}
            />
            <select
              value={newEmployee.role}
              onChange={(e) => setNewEmployee({...newEmployee, role: e.target.value})}
              style={{ padding: '10px 14px', border: '1px solid #D8E1D7', borderRadius: 8, fontSize: 14 }}
            >
              <option value="SDR">SDR (Sales Development Rep)</option>
              <option value="Analyst">Analyst (Read-only)</option>
              <option value="Admin">Admin (Full Access)</option>
            </select>
            <button
              onClick={handleAddEmployee}
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
              Grant Access
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
            {employees.map(emp => (
              <tr key={emp.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                <td style={{ padding: '16px' }}>
                  <div style={{ fontWeight: 600, color: '#14202B' }}>{emp.name}</div>
                  <div style={{ fontSize: 13, color: '#7B8794' }}>{emp.email}</div>
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
                    {emp.role}
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
                  <button style={{
                    background: 'none',
                    border: '1px solid #D8E1D7',
                    padding: '6px 16px',
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: 'pointer',
                    marginRight: 8,
                  }}>
                    Reset Password
                  </button>
                  <button style={{
                    background: '#FEE2E2',
                    border: 'none',
                    padding: '6px 16px',
                    borderRadius: 6,
                    fontSize: 13,
                    color: '#991B1B',
                    cursor: 'pointer',
                  }}>
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
