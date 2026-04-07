export default function TeamSettingsPage() {
  return (
    <div className="space-y-5 max-w-xl">
      <h1 className="font-heading text-2xl font-bold text-text-primary">Team Settings</h1>
      <div className="bg-surface border border-border-soft rounded-xl p-5">
        <p className="font-heading font-semibold text-text-primary mb-4">Members</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border-soft">
            <div>
              <p className="text-sm font-medium text-text-primary">You</p>
              <p className="text-xs text-text-muted">owner</p>
            </div>
            <span className="text-xs bg-brand-primary text-white px-2 py-0.5 rounded-full">Owner</span>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-sm font-medium text-text-primary mb-2">Invite Member</p>
          <div className="flex gap-2">
            <input type="email" placeholder="colleague@company.com"
              className="flex-1 border border-border-soft rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-primary" />
            <select className="border border-border-soft rounded-lg px-3 py-2 text-sm">
              <option>member</option>
              <option>admin</option>
            </select>
            <button className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-hover">Invite</button>
          </div>
        </div>
      </div>
    </div>
  );
}
