import { randomBytes } from 'node:crypto';

const tickets = new Map();

function pruneExpiredTickets() {
  const now = Date.now();
  for (const [ticket, entry] of tickets.entries()) {
    if (entry.expiresAt <= now) tickets.delete(ticket);
  }
}

export function issueBrowserPreviewTicket({ subject, agentId, agentConfig, expiresAt }) {
  pruneExpiredTickets();

  // A reconnect replaces its own old ticket; there is never an unbounded list
  // of browser credentials for one user and one agent.
  for (const [ticket, entry] of tickets.entries()) {
    if (entry.subject === subject && entry.agentId === agentId) tickets.delete(ticket);
  }

  const ticket = randomBytes(32).toString('base64url');
  tickets.set(ticket, { subject, agentId, agentConfig, expiresAt });
  return ticket;
}

export function claimBrowserPreviewTicket(ticket) {
  pruneExpiredTickets();
  const entry = tickets.get(ticket);
  if (!entry || entry.claimed) return null;
  entry.claimed = true;
  return entry;
}

export function removeBrowserPreviewTickets({ subject, agentId }) {
  for (const [ticket, entry] of tickets.entries()) {
    if (entry.subject === subject && entry.agentId === agentId) tickets.delete(ticket);
  }
}
