// A request to hear or clarify the caller is not a sales refusal.
export function isAudioClarification(text) {
  const normalized = String(text || '').toLowerCase().replace(/[’']/g, "'").trim();
  if (!normalized) return false;
  // Explicit refusal wins even if preceded by an apology or a hearing problem.
  if (/\b(?:not interested|no thank(?:s| you)|don't (?:want|need)|do not (?:want|need|call)|don't call|stop calling|remove me|we're (?:all )?set|hang up|leave (?:me|us) alone)\b/.test(normalized)) return false;
  return /\b(?:can't|cannot|couldn't|can not|don't)\s+(?:hear|understand)\b|\b(?:breaking up|cutting out|bad connection|say (?:that|it) again|repeat (?:that|it)|who (?:is this|are you)|where are you calling from)\b/.test(normalized)
    || /^(?:(?:i'm|i am)\s+)?sorry[.!?\s]*(?:hello[.!?\s]*)?$/.test(normalized)
    || /^(?:hello|pardon|excuse me|what)[.!?\s]*$/.test(normalized);
}
