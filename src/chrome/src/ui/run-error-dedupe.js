export function normalizeRunErrorMessage(message) {
  return String(message || '').replace(/\s+/g, ' ').trim() || 'unknown error';
}

export function runErrorIdentity(tabId, requestId, messageKey) {
  return JSON.stringify([
    String(tabId ?? ''),
    String(requestId || ''),
    String(messageKey || ''),
  ]);
}

export function claimRunError({
  seenErrors = null,
  renderedErrors = [],
  tabId,
  requestId,
  message,
} = {}) {
  const scopedTabId = String(tabId ?? '');
  const scopedRequestId = String(requestId || '');
  const key = normalizeRunErrorMessage(message);
  const identity = runErrorIdentity(scopedTabId, scopedRequestId, key);
  const duplicate = !!scopedRequestId && (
    seenErrors?.has(identity)
    || renderedErrors.some(rendered => (
      String(rendered?.tabId ?? '') === scopedTabId
      && String(rendered?.requestId || '') === scopedRequestId
      && String(rendered?.key || '') === key
    ))
  );
  if (!duplicate && scopedRequestId) seenErrors?.add(identity);
  return { duplicate, identity, key, tabId: scopedTabId, requestId: scopedRequestId };
}
