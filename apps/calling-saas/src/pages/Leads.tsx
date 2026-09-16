import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ClipboardPaste, ExternalLink, LoaderCircle, Phone, Save, StickyNote, Trash2, Upload, Users, X } from 'lucide-react';
import { callsApi, type Agent, type Contact } from '../services/callsApi';
import { openDialer } from '../dialer-events';
import { useNotifications } from '../components/Notifications';

interface PastedLead {
  company: string;
  phoneNumber: string;
}

type LeadOutcome = 'interested' | 'not_interested' | 'again_call' | 'voicemail';
type LeadFilter = 'all' | 'interested' | 'not_interested' | 'again_call' | 'voicemail' | 'called' | 'not_called';

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

function splitPastedRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim());
  if (line.includes(',')) return splitCsvLine(line);

  // Some clipboard sources turn Excel tabs into spaces. Detect a US/Canada
  // phone number at the end of that kind of row and split it from the company.
  const spacedPhone = line.match(
    /^(.*?)(?:\s+)(\+?(?:1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4})$/,
  );
  return spacedPhone ? [spacedPhone[1].trim(), spacedPhone[2].trim()] : [line.trim()];
}

function normalizeNorthAmericanPhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (digits.length === 10 && /^[2-9]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1') && /^[2-9]/.test(digits.slice(1))) return `+${digits}`;
  if (trimmed.startsWith('+')) return `+${digits}`;
  return trimmed;
}

function parsePastedLeads(value: string): { leads: PastedLead[]; ignored: number } {
  const rows = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitPastedRow);

  if (!rows.length) return { leads: [], ignored: 0 };

  const firstRow = rows[0].join(' ').toLowerCase();
  const hasHeader = /company|business|phone|number|mobile|contact/.test(firstRow);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const phones = new Set<string>();
  let ignored = 0;

  const leads = dataRows.flatMap((row) => {
    const company = (row[0] || '').trim();
    const phoneNumber = normalizeNorthAmericanPhone(row[1] || '');
    const digits = phoneNumber.replace(/\D/g, '');

    if (!company || digits.length < 10 || phones.has(phoneNumber)) {
      ignored += 1;
      return [];
    }

    phones.add(phoneNumber);
    return [{ company, phoneNumber }];
  });

  return { leads, ignored };
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function websiteLabel(website?: string | null): string {
  if (!website) return 'No website';
  try {
    return new URL(website).hostname.replace(/^www\./, '');
  } catch {
    return website;
  }
}

function isLeadOutcome(value?: string | null): value is LeadOutcome {
  return value === 'interested' || value === 'not_interested' || value === 'again_call';
}

function dateTimeInputValue(value?: string | null): string {
  const date = value ? new Date(value) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function followUpLabel(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

export default function Leads() {
  const { notify, confirm } = useNotifications();
  const [pastedText, setPastedText] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [importing, setImporting] = useState(false);
  const [openNotesId, setOpenNotesId] = useState<number | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [outcomeDrafts, setOutcomeDrafts] = useState<Record<number, LeadOutcome>>({});
  const [nextCallDrafts, setNextCallDrafts] = useState<Record<number, string>>({});
  const [savingLeadId, setSavingLeadId] = useState<number | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<number | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [leadFilter, setLeadFilter] = useState<LeadFilter>('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [employees, setEmployees] = useState<Agent[]>([]);

  const parsed = useMemo(() => parsePastedLeads(pastedText), [pastedText]);
  const prioritizedContacts = useMemo(
    () => [...contacts].sort((left, right) => {
      const leftHasWebsite = Boolean(left.website?.trim());
      const rightHasWebsite = Boolean(right.website?.trim());
      return Number(leftHasWebsite) - Number(rightHasWebsite);
    }),
    [contacts],
  );
  const filteredContacts = useMemo(() => prioritizedContacts.filter((c) => {
    if (employeeFilter === 'admin' && c.assigned_agent_id) return false;
    if (employeeFilter !== 'all' && employeeFilter !== 'admin' && String(c.assigned_agent_id) !== employeeFilter) return false;
    if (leadFilter === 'interested') return c.stage === 'interested';
    if (leadFilter === 'not_interested') return c.stage === 'not_interested';
    if (leadFilter === 'again_call') return c.stage === 'again_call';
    if (leadFilter === 'voicemail') return c.stage === 'voicemail' || c.last_call_outcome === 'voicemail';
    if (leadFilter === 'called') return !!c.last_called_at;
    if (leadFilter === 'not_called') return !c.last_called_at;
    return true;
  }), [employeeFilter, leadFilter, prioritizedContacts]);

  async function loadContacts() {
    setLoadingContacts(true);
    try {
      const [response, agentsResponse] = await Promise.all([
        callsApi.listContacts(),
        callsApi.listAgents().catch(() => ({ agents: [] as Agent[] })),
      ]);
      setContacts(response.contacts || []);
      setEmployees((agentsResponse.agents || []).filter((agent) => agent.signalwire_identity));
    } catch (error) {
      console.error('Could not load contacts', error);
      notify('Unable to load the Lead List. Refresh the page and try again.', 'error');
    } finally {
      setLoadingContacts(false);
    }
  }

  useEffect(() => {
    loadContacts();
  }, []);

  async function importPastedLeads() {
    if (!parsed.leads.length) return;

    setImporting(true);
    try {
      const csv = [
        'name,phone_number,company,source',
        ...parsed.leads.map((lead) => [
          csvCell(lead.company),
          csvCell(lead.phoneNumber),
          csvCell(lead.company),
          csvCell('pasted_excel'),
        ].join(',')),
      ].join('\n');
      const file = new File([csv], 'pasted-leads.csv', { type: 'text/csv' });
      const response = await callsApi.importContactsCsv(file);
      const duplicateText = response.duplicates ? ` ${response.duplicates} duplicate lead${response.duplicates === 1 ? '' : 's'} already exist.` : '';
      notify(`${response.imported} lead${response.imported === 1 ? '' : 's'} imported.${duplicateText}`, 'success');
      setPastedText('');
      await loadContacts();
    } catch (error: any) {
      console.error('Could not import pasted leads', error);
      notify('Unable to import leads. Check the phone numbers and your account access.', 'error');
    } finally {
      setImporting(false);
    }
  }

  function noteFor(contact: Contact): string {
    return noteDrafts[contact.id] ?? contact.notes ?? '';
  }

  function outcomeFor(contact: Contact): LeadOutcome | '' {
    return outcomeDrafts[contact.id] ?? (isLeadOutcome(contact.stage) ? contact.stage : '');
  }

  function nextCallFor(contact: Contact): string {
    return nextCallDrafts[contact.id] ?? dateTimeInputValue(contact.next_call_at);
  }

  async function saveLeadNotes(contact: Contact) {
    const outcome = outcomeFor(contact);
    const nextCallAt = nextCallFor(contact);
    if (outcome === 'again_call' && !nextCallAt) {
      notify('Select a date and time for the follow-up call.', 'info');
      return;
    }

    setSavingLeadId(contact.id);
    try {
      const response = await callsApi.updateContact(contact.id, {
        notes: noteFor(contact),
        ...(outcome ? { stage: outcome } : {}),
        ...(outcome ? { next_call_at: outcome === 'again_call' ? new Date(nextCallAt).toISOString() : null } : {}),
      });
      setContacts((current) => current.map((lead) => lead.id === contact.id ? response.contact : lead));
      setOpenNotesId(null);
      notify('Lead notes saved.', 'success');
    } catch (error) {
      console.error('Could not save lead notes', error);
      notify('Unable to save notes. Please try again.', 'error');
    } finally {
      setSavingLeadId(null);
    }
  }

  async function deleteAllLeads() {
    const shouldDelete = await confirm({
      title: 'Delete ALL leads?',
      message: 'Are you sure you want to permanently delete ALL leads in your account? This action cannot be undone.',
      confirmLabel: 'Delete All',
      destructive: true,
    });
    if (!shouldDelete) return;

    setClearingAll(true);
    try {
      await callsApi.clearAllContacts();
      setContacts([]);
      setOpenNotesId(null);
      notify('All leads have been deleted.', 'success');
    } catch (error) {
      console.error('Could not delete all leads', error);
      notify('Unable to delete leads. Please try again.', 'error');
    } finally {
      setClearingAll(false);
    }
  }

  async function deleteLead(contact: Contact) {
    const businessName = contact.company || contact.name;
    const shouldDelete = await confirm({
      title: 'Delete lead?',
      message: `${businessName} will be permanently deleted from the Lead List.`,
      confirmLabel: 'Delete lead',
      destructive: true,
    });
    if (!shouldDelete) return;

    setDeletingLeadId(contact.id);
    try {
      await callsApi.removeContact(contact.id);
      setContacts((current) => current.filter((lead) => lead.id !== contact.id));
      setOpenNotesId((current) => current === contact.id ? null : current);
      notify('Lead deleted.', 'success');
    } catch (error) {
      console.error('Could not delete lead', error);
      notify('Unable to delete the lead. Please try again.', 'error');
    } finally {
      setDeletingLeadId(null);
    }
  }

  return (
    <div className="max-w-6xl space-y-8 animate-in fade-in duration-500">
      <header>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ClipboardPaste size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Lead List</h1>
            <p className="text-textMuted mt-1">Google Maps aur Excel se business leads ko calling ke liye manage karein.</p>
          </div>
        </div>
      </header>

      <section className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Upload size={19} className="text-secondary" />
          <h2 className="text-lg font-semibold text-white">Paste Excel Leads</h2>
        </div>
        <textarea
          value={pastedText}
          onChange={(event) => setPastedText(event.target.value)}
          placeholder={'Company Name\tPhone Number\nAcme Plumbing\t(203) 555-0101'}
          className="input-field min-h-44 resize-y font-mono text-sm leading-6"
          spellCheck={false}
        />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-textMuted">
            {parsed.leads.length > 0
              ? `${parsed.leads.length} valid lead${parsed.leads.length === 1 ? '' : 's'} ready${parsed.ignored ? `, ${parsed.ignored} row${parsed.ignored === 1 ? '' : 's'} ignored` : ''}.`
              : 'Excel ki do columns copy karke yahan Ctrl+V karein.'}
          </div>
          <button
            onClick={importPastedLeads}
            disabled={!parsed.leads.length || importing}
            className="btn-primary inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5"
          >
            {importing ? <LoaderCircle size={17} className="animate-spin" /> : <Upload size={17} />}
            Import {parsed.leads.length || ''} Lead{parsed.leads.length === 1 ? '' : 's'}
          </button>
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={deleteAllLeads}
            disabled={clearingAll || contacts.length === 0}
            className="btn-secondary inline-flex items-center justify-center gap-2 text-rose-400 hover:text-rose-300 hover:border-rose-400/50"
          >
            {clearingAll ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Delete All Leads
          </button>
        </div>

        {parsed.leads.length > 0 && (
          <div className="mt-6 overflow-x-auto border-t border-border/60 pt-4">
            <div className="grid min-w-[460px] grid-cols-[minmax(0,1fr)_200px] gap-4 px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">
              <span>Company</span>
              <span>Phone Number</span>
            </div>
            {parsed.leads.slice(0, 8).map((lead) => (
              <div key={`${lead.company}-${lead.phoneNumber}`} className="grid min-w-[460px] grid-cols-[minmax(0,1fr)_200px] gap-4 border-t border-border/50 px-3 py-3 text-sm">
                <span className="truncate text-white">{lead.company}</span>
                <span className="font-mono text-textMuted">{lead.phoneNumber}</span>
              </div>
            ))}
            {parsed.leads.length > 8 && <div className="pt-3 text-sm text-textMuted">Aur {parsed.leads.length - 8} leads import ke liye ready hain.</div>}
          </div>
        )}
      </section>

      <section className="glass-card p-6">
        <div className="flex flex-col gap-4 border-b border-border/60 pb-5 mb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Users size={19} className="text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Saved Leads</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="input-field min-w-[180px] bg-surface/50 border-border/60 py-2 text-sm"
            >
              <option value="all">All Leads</option>
              <option value="admin">Admin Leads</option>
              {employees.filter((employee) => employee.role !== 'manager').map((employee) => (
                <option key={employee.id} value={String(employee.id)}>{employee.name} Leads</option>
              ))}
            </select>
            <select
              value={leadFilter}
              onChange={(e) => setLeadFilter(e.target.value as LeadFilter)}
              className="input-field py-2 text-sm bg-surface/50 border-border/60 min-w-[160px]"
            >
              <option value="all">All Status</option>
              <option value="interested">Interested</option>
              <option value="again_call">Again Call</option>
              <option value="not_interested">Not Interested</option>
              <option value="voicemail">Voicemail</option>
              <option value="called">Called</option>
              <option value="not_called">Not Called</option>
            </select>
            <div className="text-sm font-medium text-textMuted">
              {filteredContacts.length} total
            </div>
          </div>
        </div>

        {loadingContacts ? (
          <div className="py-10 flex justify-center"><LoaderCircle size={22} className="animate-spin text-primary" /></div>
        ) : filteredContacts.length === 0 ? (
          <div className="py-10 text-center text-sm text-textMuted">Abhi koi saved lead nahin hai.</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(160px,.85fr)_160px_110px_92px] gap-4 border-b border-border/60 px-3 pb-3 text-xs font-semibold uppercase tracking-wide text-textMuted">
                <span>Business</span>
                <span>Website</span>
                <span>Phone Number</span>
                <span>Call</span>
                <span>Actions</span>
              </div>
              {filteredContacts.map((contact) => {
                const outcome = outcomeFor(contact);
                const notesOpen = openNotesId === contact.id;

                return (
                  <div key={contact.id} className="border-b border-border/50 last:border-0">
                    <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(160px,.85fr)_160px_110px_92px] gap-4 px-3 py-4 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-white">{contact.company || contact.name}</div>
                        {contact.notes?.trim() && (
                          <button
                            onClick={() => setOpenNotesId(contact.id)}
                            title={contact.notes}
                            className="mt-1 flex max-w-full items-center gap-1 text-left text-xs text-primary hover:text-primary/80"
                          >
                            <StickyNote size={13} className="shrink-0" />
                            <span className="truncate">Note: {contact.notes}</span>
                          </button>
                        )}
                        {contact.stage === 'interested' && <div className="mt-1 text-xs text-emerald-400">Interested</div>}
                        {contact.stage === 'voicemail' && <div className="mt-1 text-xs text-amber-300">Voicemail</div>}
                        {contact.stage === 'again_call' && <div className="mt-1 truncate text-xs text-amber-300">Call: {followUpLabel(contact.next_call_at) || 'Schedule needed'}</div>}
                        {contact.stage === 'not_interested' && <div className="mt-1 text-xs text-textMuted">Not interested</div>}
                      </div>
                      {contact.website ? (
                        <a
                          href={contact.website}
                          target="_blank"
                          rel="noreferrer"
                          title={contact.website}
                          className="inline-flex min-w-0 items-center gap-1 truncate text-primary hover:text-primary/80"
                        >
                          <span className="truncate">{websiteLabel(contact.website)}</span>
                          <ExternalLink size={13} className="shrink-0" />
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-amber-300">
                          <span>No website</span>
                          <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase">Call first</span>
                        </span>
                      )}
                      <span className="flex items-center gap-2 font-mono text-textMuted"><Phone size={14} />{contact.phone_number}</span>
                      <button
                        onClick={() => openDialer({
                          phone: contact.phone_number,
                          contactId: contact.id,
                          contactName: contact.name,
                          contactCompany: contact.company,
                          autoStart: true,
                        })}
                        className="btn-primary inline-flex items-center justify-center gap-2 px-3 py-2 text-sm"
                      >
                        <Phone size={15} />
                        Call
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setOpenNotesId(notesOpen ? null : contact.id)}
                          title="Notes"
                          className={`flex h-9 w-9 items-center justify-center rounded-md border transition ${notesOpen ? 'border-primary bg-primary/15 text-white' : 'border-border text-textMuted hover:text-white'}`}
                        >
                          <StickyNote size={16} />
                        </button>
                        <button
                          onClick={() => deleteLead(contact)}
                          disabled={deletingLeadId === contact.id}
                          title="Delete lead"
                          className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-textMuted transition hover:border-rose-400/50 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingLeadId === contact.id ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                      </div>
                    </div>

                    {notesOpen && (
                      <div className="border-t border-border/60 bg-surface/30 p-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-white"><StickyNote size={16} className="text-primary" /> Notes</div>
                          <button onClick={() => setOpenNotesId(null)} title="Close notes" className="text-textMuted hover:text-white"><X size={17} /></button>
                        </div>
                        <textarea
                          value={noteFor(contact)}
                          onChange={(event) => setNoteDrafts((current) => ({ ...current, [contact.id]: event.target.value }))}
                          placeholder="Write notes for this lead..."
                          className="input-field min-h-24 resize-y text-sm"
                        />
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {([
                            ['interested', 'Interested'],
                            ['not_interested', 'Not interested'],
                            ['again_call', 'Again Call'],
                            ['voicemail', 'Voicemail'],
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              onClick={() => setOutcomeDrafts((current) => ({ ...current, [contact.id]: value }))}
                              className={`rounded-md border px-3 py-2 text-sm transition ${outcome === value
                                ? value === 'interested'
                                  ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                                  : value === 'not_interested'
                                    ? 'border-rose-400/50 bg-rose-400/10 text-rose-300'
                                    : 'border-amber-400/50 bg-amber-400/10 text-amber-300'
                                : 'border-border bg-surface/40 text-textMuted hover:text-white'}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {outcome === 'again_call' && (
                          <div className="mt-4 max-w-xs">
                            <label className="mb-1 block text-sm font-medium text-textMuted" htmlFor={`next-call-${contact.id}`}>Call again at</label>
                            <div className="relative">
                              <CalendarClock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
                              <input
                                id={`next-call-${contact.id}`}
                                type="datetime-local"
                                value={nextCallFor(contact)}
                                onChange={(event) => setNextCallDrafts((current) => ({ ...current, [contact.id]: event.target.value }))}
                                className="input-field pl-10 text-sm"
                              />
                            </div>
                          </div>
                        )}
                        <div className="mt-5 flex justify-end">
                          <button
                            onClick={() => saveLeadNotes(contact)}
                            disabled={savingLeadId === contact.id}
                            className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm"
                          >
                            {savingLeadId === contact.id ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
                            Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
