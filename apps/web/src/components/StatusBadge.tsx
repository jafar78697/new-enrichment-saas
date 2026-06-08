import type { LeadStatus, SendStatus, JobStatus } from '../types';

type Status = LeadStatus | SendStatus | JobStatus | string;

interface Props {
  status: Status;
  label?: string;
}

export default function StatusBadge({ status, label }: Props) {
  const cls = `badge badge-${status}`;
  return <span className={cls}>{label ?? status.replace(/_/g, ' ')}</span>;
}
