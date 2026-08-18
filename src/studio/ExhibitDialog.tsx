/**
 * ExhibitDialog — group already-published stories into one scannable room.
 *
 * Follows PublishDialog's shape deliberately: same passphrase field, same
 * "only remember it after the server accepts it" rule (commit `150008c`
 * established that, because saving a mistyped secret pre-filled it on every
 * retry and made the dialog look broken rather than merely unauthorised).
 *
 * **The operator types story ids, and that is a real limitation, not an
 * oversight.** Spec §7.3 asks for "pick which stories belong to it", which
 * implies a list to pick from — and building that list needs a published
 * `stories/index.json`, which is the same mutable-index-that-can-disagree
 * problem `docs/marker-layer-design.md` §11 declines for markers. So typing
 * ids is the honest v1. What makes it bearable is that the field is forgiving
 * (newline- or comma-separated, trimmed, lowercased) and that each id is
 * probed against the bucket, so a typo shows up here rather than as a picture
 * that does nothing on the wall.
 *
 * The probe is advisory only. The endpoint re-reads every story server-side
 * and is the actual authority; this just moves the discovery earlier.
 */

import React, { useEffect, useState } from 'react';
import {
  isStoryHostConfigured,
  publishExhibit,
  publishedStoryUrl,
  slugifyStoryId,
  type PublishOutcome,
} from '@/services/storyApi';
import {
  MAX_EXHIBIT_STORIES,
  exhibitIssues,
  normalizeStoryIds,
  type ExhibitDoc,
} from '@/exhibit/exhibitDoc';

/** sessionStorage key for the publish secret. Shared with PublishDialog —
 *  it is the same secret and the same server check. */
const SECRET_KEY = 'arcade.studio.secret';

function readSecret(): string {
  try {
    return window.sessionStorage.getItem(SECRET_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberSecret(value: string): void {
  try {
    window.sessionStorage.setItem(SECRET_KEY, value);
  } catch {
    // Private mode or a full store: publishing still works this session.
  }
}

/** What a bucket probe found for one story id. */
type Presence = 'checking' | 'found' | 'missing' | 'unknown';

/**
 * Splits the operator's free text into ids.
 *
 * Accepts newlines and commas because both are what people actually paste,
 * and reuses `normalizeStoryIds` so the trimming and lowercasing rules match
 * the ones the endpoint will apply — a field that normalises differently from
 * the server is a field that shows a typo the server would have accepted, or
 * hides one it will not.
 */
function parseIds(text: string): string[] {
  return normalizeStoryIds(text.split(/[\n,]/));
}

export const ExhibitDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [title, setTitle] = useState('');
  const [idsText, setIdsText] = useState('');
  const [secret, setSecret] = useState(readSecret);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublishOutcome | null>(null);
  const [copied, setCopied] = useState(false);
  const [presence, setPresence] = useState<Record<string, Presence>>({});

  const storyIds = parseIds(idsText);
  const id = slugifyStoryId(title);
  const issues = exhibitIssues(storyIds);
  const hostKnown = isStoryHostConfigured();

  // Probe each id against the bucket so a typo is visible before publishing.
  // Keyed on the joined list rather than the raw text, so re-typing whitespace
  // does not re-fetch. HEAD, because only existence matters.
  const probeKey = storyIds.join(',');
  useEffect(() => {
    // Re-parsed from probeKey rather than closing over storyIds, so the effect
    // depends only on values in its own dependency list.
    const ids = parseIds(probeKey);
    if (!hostKnown || ids.length === 0) return;
    let cancelled = false;

    // No synchronous "mark them all checking" pass: an id with no entry yet is
    // already rendered as checking below, so writing that state here would only
    // be a cascading render that arrives at the same screen.
    void Promise.all(
      ids.map(async (sid) => {
        try {
          const res = await fetch(publishedStoryUrl(sid), {
            method: 'HEAD',
            credentials: 'omit',
          });
          return [sid, res.ok ? 'found' : 'missing'] as const;
        } catch {
          // Offline or CORS — say nothing rather than accuse a good id.
          return [sid, 'unknown'] as const;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setPresence((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });

    return () => {
      cancelled = true;
    };
  }, [probeKey, hostKnown]);

  const missing = storyIds.filter((sid) => presence[sid] === 'missing');
  const ready = title.trim() !== '' && issues.length === 0;

  const publish = async (): Promise<void> => {
    setBusy(true);
    const doc: ExhibitDoc = {
      schemaVersion: 1,
      id,
      title: title.trim(),
      storyIds,
    };
    const outcome = await publishExhibit(doc, id, secret);
    if (outcome.ok) rememberSecret(secret);
    setResult(outcome);
    setBusy(false);
  };

  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked — the field is selectable, so this is recoverable.
    }
  };

  return (
    <div className="st-modal on" role="dialog" aria-label="Exhibit">
      <div className="st-modalbox st-narrow">
        <div className="st-modalhead">
          <h2>EXHIBIT</h2>
          <button className="st-closex" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {result?.ok === true ? (
          <>
            <p className="st-msub">
              Saved. The room document is published and every story in it was checked.
            </p>
            <label className="st-lbl" htmlFor="st-ex-link">
              Visitor link
            </label>
            <div className="st-linkrow">
              <input
                id="st-ex-link"
                readOnly
                value={result.viewUrl}
                onFocus={(e) => e.target.select()}
              />
              <button className="st-btn green" onClick={() => void copy(result.viewUrl)}>
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>
            <div className="st-warn">
              <b>This link does not scan yet.</b> Marker detection is not wired into the viewer
              (Task 16), so opening it today shows the default story rather than the room. The
              document is correct and the link will not change — it starts working when marker
              scanning ships. Don&apos;t print it on anything yet.
            </div>
            <div className="st-statline">
              Republishing with the same title replaces this exhibit. Change the title to publish a
              separate one.
            </div>
            <div className="st-modalfoot">
              <button className="st-btn paper" onClick={onClose}>
                DONE
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="st-msub">
              A room is a list of stories you have already published. Each one needs its own
              picture — the tracker watches up to {MAX_EXHIBIT_STORIES} at once.
            </p>

            <label className="st-lbl" htmlFor="st-ex-title">
              Room title
            </label>
            <input
              id="st-ex-title"
              className="st-in"
              value={title}
              placeholder="The Lobby"
              onChange={(e) => setTitle(e.target.value)}
            />

            <label className="st-lbl" htmlFor="st-ex-ids">
              Story ids — one per line
            </label>
            <textarea
              id="st-ex-ids"
              className="st-ta"
              value={idsText}
              rows={6}
              placeholder={'the-ground-remembers\nlobby-stairs'}
              onChange={(e) => setIdsText(e.target.value)}
              spellCheck={false}
            />
            <div className="st-statline">
              These are the ids from each story&apos;s own publish link (the{' '}
              <code>?s=</code> value). There is no list to pick from yet — see the note in{' '}
              <code>marker-layer-design.md</code> §11.
            </div>

            {storyIds.length > 0 && (
              <ul className="st-checks">
                {storyIds.map((sid) => {
                  const state = presence[sid] ?? (hostKnown ? 'checking' : 'unknown');
                  const mark =
                    state === 'found' ? '✔' : state === 'missing' ? '✖' : state === 'checking' ? '…' : '?';
                  return (
                    <li key={sid}>
                      <span className={state === 'missing' ? 'st-bad' : state === 'found' ? 'st-ok' : undefined}>
                        {mark}
                      </span>{' '}
                      <code>{sid}</code>
                      {state === 'missing' && ' — not published under that id'}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="st-statline">
              {storyIds.length} stor{storyIds.length === 1 ? 'y' : 'ies'} · publishes as{' '}
              <code>/?e={id}</code>
            </div>

            {issues.length > 0 && <div className="st-warn">{issues.join(' ')}</div>}

            {missing.length > 0 && issues.length === 0 && (
              <div className="st-warn">
                {missing.length === 1
                  ? 'One id is not published yet. '
                  : `${missing.length} ids are not published yet. `}
                The server checks this too and will refuse — publish those stories first.
              </div>
            )}

            {!hostKnown && (
              <div className="st-warn">
                This build doesn&apos;t know where published stories live, so the ids above
                can&apos;t be checked from here. Set <code>VITE_STORY_BASE_URL</code> and redeploy;
                publishing still works, and the server checks every id regardless.
              </div>
            )}

            <label className="st-lbl" htmlFor="st-ex-secret">
              Publish key
            </label>
            <input
              id="st-ex-secret"
              className="st-in"
              type="password"
              value={secret}
              placeholder="Set by whoever configured the project"
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
            />

            {result?.ok === false && <div className="st-warn st-mt">{result.error}</div>}

            <div className="st-modalfoot">
              <button className="st-btn paper" onClick={onClose}>
                CANCEL
              </button>
              <button
                className="st-btn orange"
                disabled={!ready || secret.trim() === '' || busy}
                onClick={() => void publish()}
                title={ready ? 'Publish this room' : 'Add a title and at least one story id'}
              >
                {busy ? 'PUBLISHING…' : '⬆ PUBLISH ROOM'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
