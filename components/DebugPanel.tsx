'use client';
// The ABConvert panel: the visitor, the page key this page rendered under, the
// visitor's test groups, and a way to force a test group. Forcing opens the
// same link a preview link uses (`abconvert_force=<test ID>:<index>`), so it
// works on a cached page too. A forced visit is never counted in results.
// https://docs.abconvert.io/headless-sdk/preview
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useABConvert } from '@abconvert/headless/react';

export function DebugPanel() {
  const abconvert = useABConvert();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [testId, setTestId] = useState('');
  const [index, setIndex] = useState('1');
  const [previewKey, setPreviewKey] = useState('');

  const read = <T,>(get: () => T, fallback: T): T => {
    try {
      return get();
    } catch {
      return fallback;
    }
  };
  const assignments = read(() => abconvert.getAssignments(), []);
  const forced = assignments.filter((assignment) => assignment.reason !== 'random_split' && assignment.reason !== 'force_assign_group');

  const force = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams({ abconvert_force: `${testId.trim()}:${index}` });
    if (previewKey.trim()) params.set('abconvert_preview_key', previewKey.trim());
    window.location.assign(`${pathname}?${params}`);
  };
  const clear = () => {
    for (const assignment of forced) abconvert.clearForcedTestGroup(assignment.experimentId);
    window.location.assign(pathname);
  };

  return (
    <aside className={open ? 'debug open' : 'debug'}>
      <button type="button" className="debug-toggle" onClick={() => setOpen(!open)}>ABConvert {open ? '×' : '▲'}</button>
      {open ? (
        <div className="debug-body">
          <dl>
            <dt>Ready</dt><dd>{abconvert.isReady ? 'yes' : 'not yet'}</dd>
            <dt>Visitor</dt><dd className="mono">{read(() => abconvert.getVisitorId(), '') || 'none yet'}</dd>
            <dt>Page key</dt><dd className="mono">{read(() => abconvert.getPageKey(), '') || 'none (no test changes this page)'}</dd>
            <dt>Country</dt><dd>{read(() => abconvert.getCountry(), '')}</dd>
          </dl>
          <h4>Test groups</h4>
          {assignments.length ? (
            <ul>
              {assignments.map((assignment) => (
                <li key={assignment.experimentId}>
                  <strong>{assignment.experimentName}</strong> <span className="muted">#{assignment.experimentId}, {assignment.type}</span>
                  <br />
                  {assignment.testGroup.name} (index {assignment.testGroup.index}) <span className="muted">{assignment.reason}{assignment.status === 'preview' ? ', preview' : ''}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">None on this page. Launch a test, or open a preview link.</p>
          )}
          <h4>Force a test group</h4>
          <form onSubmit={force} className="debug-form">
            <input value={testId} onChange={(event) => setTestId(event.target.value)} placeholder="Test ID" required />
            <select value={index} onChange={(event) => setIndex(event.target.value)} aria-label="Test group">
              {[0, 1, 2, 3].map((value) => <option key={value} value={value}>{value === 0 ? 'Control (0)' : `Variant ${String.fromCharCode(64 + value)} (${value})`}</option>)}
            </select>
            <input value={previewKey} onChange={(event) => setPreviewKey(event.target.value)} placeholder="Preview key, for a test in Preview" />
            <button type="submit">Force</button>
          </form>
          {forced.length ? <button type="button" onClick={clear}>Clear forced test groups</button> : null}
        </div>
      ) : null}
    </aside>
  );
}
