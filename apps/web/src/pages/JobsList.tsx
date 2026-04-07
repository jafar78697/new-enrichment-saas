import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { jobsApi } from '../services/api';

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-600',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

export default function JobsListPage() {
  const { data, isLoading } = useQuery({ queryKey: ['jobs-list'], queryFn: () => jobsApi.list({ limit: 50 }).then(r => r.data) });

  if (isLoading) return <div className="text-text-muted text-sm">Loading jobs...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-text-primary">Jobs</h1>
        <Link to="/jobs/new" className="bg-brand-primary hover:bg-brand-hover text-white px-4 py-2 rounded-lg text-sm font-medium">+ New Job</Link>
      </div>

      <div className="bg-surface border border-border-soft rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-subtle border-b border-border-soft">
            <tr>
              {['Job ID', 'Mode', 'Status', 'Progress', 'Created'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {data?.jobs?.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-text-muted">No jobs yet. <Link to="/jobs/new" className="text-brand-primary">Create one</Link></td></tr>
            )}
            {data?.jobs?.map((job: any) => (
              <tr key={job.id} className="hover:bg-subtle">
                <td className="px-4 py-3">
                  <Link to={`/jobs/${job.id}`} className="font-mono text-xs text-brand-primary hover:underline">{job.id.slice(0, 12)}...</Link>
                </td>
                <td className="px-4 py-3 text-text-secondary capitalize">{job.mode?.replace('_', ' ')}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-600'}`}>{job.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-subtle rounded-full h-1.5">
                      <div className="bg-brand-primary h-1.5 rounded-full" style={{ width: `${job.total_items ? (job.completed_items / job.total_items) * 100 : 0}%` }} />
                    </div>
                    <span className="text-xs text-text-muted">{job.completed_items}/{job.total_items}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-text-muted text-xs">{new Date(job.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
