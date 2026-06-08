import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { callsApi, type Contact } from '../services/callsApi';
import { getCallUser } from '../services/employeesApi';
import DialerPopup from '../components/DialerPopup';
import { nichesApi } from '../services/nichesApi';
import { Mail, Globe, Phone } from 'lucide-react';

type CreateForm = {
  name: string;
  phone_number: string;
  company: string;
  email: string;
  notes: string;
};

const EMPTY_FORM: CreateForm = { name: '', phone_number: '', company: '', email: '', notes: '' };

export default function ContactsPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dialContact, setDialContact] = useState<Contact | null>(null);
  const [myNiches, setMyNiches] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const callUser = getCallUser();

  useEffect(() => {
    if (!callUser) {
      navigate('/call-login?next=/contacts');
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const { contacts } = await callsApi.listContacts();
      setContacts(contacts || []);
      
      if (callUser?.role !== 'manager') {
        const { niches } = await nichesApi.my();
        setMyNiches(niches || []);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const update = (k: keyof CreateForm, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const create = async () => {
    if (!form.name.trim() || !form.phone_number.trim()) {
      setStatus('Name and phone are required');
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      const { contact } = await callsApi.createContact({
        name: form.name.trim(),
        phone_number: form.phone_number.trim(),
        company: form.company.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      });
      setContacts((list) => [contact, ...list]);
      setForm(EMPTY_FORM);
      setStatus(`✓ Added ${contact.name}`);
    } catch (e: any) {
      setStatus(e?.message || 'Failed to add contact');
    } finally {
      setSubmitting(false);
    }
  };

  const importCsv = async (file: File) => {
    setImporting(true);
    setStatus(null);
    try {
      const { imported } = await callsApi.importContactsCsv(file);
      setStatus(`✓ Imported ${imported} contact${imported === 1 ? '' : 's'}`);
      await refresh();
    } catch (e: any) {
      setStatus(e?.message || 'Import failed');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone_number || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q),
    );
  }, [contacts, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: '#14202B', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700 }}>
            {callUser?.role === 'manager' ? 'Contacts' : `Leads — ${myNiches[0]?.name || 'My Queue'}`}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#52606D' }}>
            {callUser?.role === 'manager' 
              ? 'People you call. Import a CSV or add them one by one.'
              : `Your assigned leads from the ${myNiches[0]?.name || 'selected'} niche.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <Stat label="Contacts" value={contacts.length} />
        </div>
      </div>

      {status && (
        <div
          style={{
            padding: 10,
            background: status.startsWith('✓') ? '#F0FDF4' : '#FEF2F2',
            border: '1px solid ' + (status.startsWith('✓') ? '#BBF7D0' : '#FECACA'),
            borderRadius: 8,
            color: status.startsWith('✓') ? '#166534' : '#B91C1C',
            fontSize: 13,
          }}
        >
          {status}
        </div>
      )}

      {/* Quick add + CSV (Manager only) */}
      {callUser?.role === 'manager' && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#14202B' }}>Add contact</div>
            <label style={{ ...btnSecondary, position: 'relative', overflow: 'hidden' }}>
              {importing ? 'Importing…' : 'Import CSV'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                disabled={importing}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importCsv(file);
                }}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            <input placeholder="Name *"    value={form.name}         onChange={(e) => update('name', e.target.value)} style={input} />
            <input placeholder="Phone *"   value={form.phone_number} onChange={(e) => update('phone_number', e.target.value)} style={input} />
            <input placeholder="Company"   value={form.company}      onChange={(e) => update('company', e.target.value)} style={input} />
            <input placeholder="Email"     value={form.email}        onChange={(e) => update('email', e.target.value)} style={input} />
            <button onClick={create} disabled={submitting} style={{ ...btn, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Adding…' : '+ Add'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#7B8794', marginTop: 8 }}>
            CSV columns: <code>name, phone_number, company, email, notes</code> (<code>phone</code> or <code>number</code> also accepted).
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: 10, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#B91C1C', fontSize: 13 }}>{error}</div>
      )}

      {/* List */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid #EEF2EA' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#14202B' }}>
            {loading ? 'Loading…' : `${filtered.length} of ${contacts.length}`}
          </div>
          <input
            placeholder="Search by name, phone, company, email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...input, minWidth: 260 }}
          />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#FBFBF8', textAlign: 'left', color: '#52606D' }}>
                <th style={th}>Lead Details</th>
                <th style={th}>Social / Web</th>
                {callUser?.role === 'manager' && <th style={th}>Niche</th>}
                <th style={th}>Last Outcome</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#7B8794' }}>
                    No contacts yet. Add one above or import a CSV.
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid #EEF2EA' }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: '#14202B' }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: '#52606D' }}>{c.company || 'Private Person'}</div>
                    <div style={{ fontSize: 11, color: '#7B8794', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Phone size={10} /> {c.phone_number}
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {c.email && (
                        <a href={`mailto:${c.email}`} title={c.email} style={socialBtn}>
                          <Mail size={14} />
                        </a>
                      )}
                      {c.notes && c.notes.includes('http') ? (
                        <a href={c.notes.match(/https?:\/\/[^\s]+/)?.[0]} target="_blank" rel="noreferrer" style={socialBtn}>
                          <Globe size={14} />
                        </a>
                      ) : (
                        <span style={{ ...socialBtn, opacity: 0.2, cursor: 'default' }}>
                          <Globe size={14} />
                        </span>
                      )}
                    </div>
                  </td>
                  {callUser?.role === 'manager' && (
                    <td style={td}>
                      <span style={{ fontSize: 11, background: '#F5F3FF', color: '#6D28D9', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                        {c.niche_name || 'Unassigned'}
                      </span>
                    </td>
                  )}
                  <td style={td}>
                    {c.last_call_outcome ? (
                      <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: '#EEF2EA', color: '#0F766E', fontWeight: 600 }}>
                        {c.last_call_outcome}
                      </span>
                    ) : <span style={dash}>—</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => setDialContact(c)}
                      style={callBtn}
                    >
                      <Phone size={14} /> Call
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialContact && (
        <DialerPopup
          phone={dialContact.phone_number}
          contactId={dialContact.id}
          contactName={dialContact.name}
          contactCompany={dialContact.company || null}
          onClose={() => setDialContact(null)}
          onEnded={() => {
            setDialContact(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ padding: '8px 14px', border: '1px solid #D8E1D7', borderRadius: 10, background: '#fff', minWidth: 90 }}>
      <div style={{ fontSize: 10, color: '#7B8794', letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#14202B', fontFamily: 'Space Grotesk, sans-serif' }}>{value}</div>
    </div>
  );
}

// ─── Styles
const card: React.CSSProperties = { background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 16 };
const th: React.CSSProperties = { padding: '10px 14px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: '12px 14px', color: '#14202B' };
const dash: React.CSSProperties = { color: '#CBD5E1', fontSize: 12 };
const input: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 8, border: '1px solid #D8E1D7', fontSize: 13,
  background: '#fff', color: '#14202B', outline: 'none', fontFamily: 'Manrope, sans-serif',
};
const btn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 8, border: 'none',
  background: '#0F766E', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 8, border: '1px solid #D8E1D7',
  background: '#fff', color: '#14202B', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center',
};
const callBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 8, border: 'none',
  background: '#0F766E', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  boxShadow: '0 2px 4px rgba(15,118,110,0.2)'
};
const socialBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 30, height: 30, borderRadius: 6, border: '1px solid #EEF2EA',
  color: '#52606D', textDecoration: 'none', transition: 'all 0.2s'
};
