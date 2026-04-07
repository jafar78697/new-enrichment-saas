import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { jobsApi } from '../services/api';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobsApi.get(id!).then(r => r.data),
    refetchInterval: (query) => query.state.data?.status === 'running' ? 3000 : false,
  });

  const cancelMutation = useMutation({
    mutationFn: () => jobsApi.cancel(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job', id] }),
  });

  const retryMutation = useMutation({
    mutationFn: () => jobsApi.retryFailed(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job', id] }),
  });

  const exportMutation = useMutation({
    mutationFn: (format: string) => jobsApi.export(id!, format),
  });

  if (isLoading) return <div className="text-text-muted text-sm">Loading...</div>;
  if (!job) return <div className="text-danger text-sm">Job not found</div>;

  const progress = job.total_items ? Math.round((job.completed_items / job.total_items) * 100) : 0;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-text-primary">Job {job.id.slice(0, 12)}...</h1>
          <p className="text-xs text-text-muted mt-0.5">{job.mode?.replace('_', ' ')} • {new Date(job.created_at).toLocaleString()}</p>
        </div>
        <div className="flex gap-2">
          {job.status === 'running' && (
            <button onClick={() => cancelMutation.mutate()} className="px-3 py-1.5 text-sm border border-border-soft rounded-lg text-text-secondary hover:border-danger hover:text-danger">Cancel</button>
          )}
          {job.failed_items > 0 && (
            <button onClick={() => retryMutation.mutate()} className="px-3 py-1.5 text-sm border border-brand-primary text-brand-primary rounded-lg hover:bg-subtle">Retry Failed</button>
          )}
          <button onClick={() => exportMutation.mutate('csv')} className="px-3 py-1.5 text-sm bg-brand-primary text-white rounded-lg hover:bg-brand-hover">Export CSV</button>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-surface border border-border-soft rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-text-primary">Progress</span>
          <span className="font-mono text-sm text-text-secondary">{progress}%</span>
        </div>
        <div className="w-full bg-subtle rounded-full h-2.5">
          <div className="bg-brand-primary h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex gap-6 mt-3 text-xs text-text-secondary">
          <span>✓ {job.completed_items} completed</span>
          <span>✗ {job.failed_items} failed</span>
          <span>⏳ {job.total_items - job.completed_items - job.failed_items} queued</span>
          <span>HTTP: {job.http_completed ?? 0}</span>
          <span>Browser: {job.browser_completed ?? 0}</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <Link to={`/results/${id}`} className="px-4 py-2 text-sm bg-surface border border-border-soft rounded-lg text-text-secondary hover:border-brand-primary">View Results</Link>
        <button onClick={() => exportMutation.mutate('json')} className="px-4 py-2 text-sm bg-surface border border-border-soft rounded-lg text-text-secondary hover:border-brand-primary">Export JSON</button>
      </div>

      {/* Status info */}
      {job.status === 'completed' && (
        <div className="bg-green-50 border border-success text-success text-sm rounded-lg p-3">
          Job completed. {job.completed_items} domains enriched successfully.
        </div>
      )}
      {job.failed_items > 0 && (
        <div className="bg-amber-50 border border-signal text-amber-700 text-sm rounded-lg p-3">
          {job.failed_items} domains failed. Retry failed items or export current results.
        </div>
      )}
    </div>
  );
}
