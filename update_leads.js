const fs = require('fs');
const file = 'apps/calling-saas/src/pages/Leads.tsx';
let content = fs.readFileSync(file, 'utf8');

// Update Types
content = content.replace(
  "type LeadOutcome = 'interested' | 'not_interested' | 'again_call';",
  "type LeadOutcome = 'interested' | 'not_interested' | 'again_call' | 'voicemail';"
);
content = content.replace(
  "type LeadFilter = 'all' | 'interested' | 'again_call';",
  "type LeadFilter = 'all' | 'interested' | 'not_interested' | 'again_call' | 'voicemail' | 'called' | 'not_called';"
);

// Add state for clearing
content = content.replace(
  "const [deletingLeadId, setDeletingLeadId] = useState<number | null>(null);",
  "const [deletingLeadId, setDeletingLeadId] = useState<number | null>(null);\n  const [clearingAll, setClearingAll] = useState(false);"
);

// Update filteredContacts logic
content = content.replace(
  /const filteredContacts = useMemo\(\(\) => prioritizedContacts\.filter\(\(contact\) => \{\s*if \(leadFilter === 'all'\) return true;\s*return contact\.stage === leadFilter;\s*\}\), \[leadFilter, prioritizedContacts\]\);/,
  `const filteredContacts = useMemo(() => prioritizedContacts.filter((c) => {
    if (leadFilter === 'interested') return c.stage === 'interested';
    if (leadFilter === 'not_interested') return c.stage === 'not_interested';
    if (leadFilter === 'again_call') return c.stage === 'again_call';
    if (leadFilter === 'voicemail') return c.stage === 'voicemail';
    if (leadFilter === 'called') return !!c.last_called_at;
    if (leadFilter === 'not_called') return !c.last_called_at;
    return true;
  }), [leadFilter, prioritizedContacts]);`
);

// Add deleteAllLeads function
content = content.replace(
  "async function deleteLead(contact: Contact) {",
  `async function deleteAllLeads() {
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

  async function deleteLead(contact: Contact) {`
);

// Update Import Leads UI to include Delete All Leads
content = content.replace(
  `            <button
              onClick={importPastedLeads}
              disabled={!parsed.leads.length || importing}
              className="btn-primary inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5"
            >
              {importing ? <LoaderCircle size={17} className="animate-spin" /> : <Upload size={17} />}
              Import {parsed.leads.length || ''} Lead{parsed.leads.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>`,
  `            <button
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
        </div>`
);

// Update Filter UI to be a dropdown
content = content.replace(
  /<div className="flex items-center justify-between gap-4 mb-5">\s*<div className="flex items-center gap-2">\s*<Users size=\{19\} className="text-emerald-400" \/>\s*<h2 className="text-lg font-semibold text-white">Saved Leads<\/h2>\s*<\/div>\s*<span className="text-sm text-textMuted">\{contacts\.length\} total\{noWebsiteCount \? ` - \$\{noWebsiteCount\} no website` : ''\}<\/span>\s*<\/div>\s*<div className="mb-5 flex flex-wrap items-center gap-2">\s*\{\(\[\s*\['all', 'All leads'\],\s*\['interested', 'Interested'\],\s*\['again_call', 'Again Call'\],\s*\] as const\)\.map\(\(\[value, label\]\) => \(\s*<button\s*key=\{value\}\s*onClick=\{\(\) => setLeadFilter\(value\)\}\s*className=\{`rounded-md border px-3 py-1\.5 text-sm transition \$\{leadFilter === value\s*\? 'border-primary bg-primary\/15 text-white'\s*: 'border-border bg-surface\/40 text-textMuted hover:text-white'\}`\}\s*>\s*\{label\}\s*<\/button>\s*\)\)\}\s*<\/div>/g,
  `<div className="flex flex-col gap-4 border-b border-border/60 pb-5 mb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Users size={19} className="text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Saved Leads</h2>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={leadFilter}
              onChange={(e) => {
                setLeadFilter(e.target.value as LeadFilter);
                setCurrentPage(1);
              }}
              className="input-field py-2 text-sm bg-surface/50 border-border/60 min-w-[160px]"
            >
              <option value="all">All leads</option>
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
        </div>`
);

// Add Voicemail indicator to lead card
content = content.replace(
  "{contact.stage === 'interested' && <div className=\"mt-1 text-xs text-emerald-400\">Interested</div>}",
  "{contact.stage === 'interested' && <div className=\"mt-1 text-xs text-emerald-400\">Interested</div>}\n                        {contact.stage === 'voicemail' && <div className=\"mt-1 text-xs text-amber-300\">Voicemail</div>}"
);

// Update outcome buttons in notes
content = content.replace(
  `{([
                            ['interested', 'Interested'],
                            ['not_interested', 'Not interested'],
                            ['again_call', 'Again Call'],
                          ] as const).map(([value, label]) => (`,
  `{([
                            ['interested', 'Interested'],
                            ['not_interested', 'Not interested'],
                            ['again_call', 'Again Call'],
                            ['voicemail', 'Voicemail'],
                          ] as const).map(([value, label]) => (`
);

fs.writeFileSync(file, content, 'utf8');
console.log('done');
