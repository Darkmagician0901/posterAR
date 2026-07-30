/**
 * PublishDialog — pre-flight checks, then publish, then the shareable link.
 *
 * The checks are the point: publishing overwrites what visitors see, so the
 * dialog states plainly what will go live and refuses obvious mistakes (no
 * title, no narration, empty frames) before offering the button.
 *
 * The publish secret is asked for once per session and held in sessionStorage.
 * It is never persisted to disk and never enters the bundle — the server holds
 * the real value and compares in constant time.
 */

import React, { useState } from 'react';
import {
  isStoryHostConfigured,
  publishStory,
  slugifyStoryId,
  type PublishOutcome,
} from '@/services/storyApi';
import { useStudioDraft } from './studioDraftStore';

/** sessionStorage key for the publish secret. */
const SECRET_KEY = 'arcade.studio.secret';

/** One pre-flight check. */
interface Check {
  ok: boolean;
  msg: string;
}

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
    // Private mode or a full store: publishing still works this session, the
    // secret just has to be retyped next time.
  }
}

/**
 * The origin the "set VITE_STORY_BASE_URL to..." hint can show — only when
 * the server actually gave us an absolute one.
 *
 * `result.url` is absolute when the server's STORY_PUBLIC_BASE_URL is
 * configured, and relative (e.g. "/stories/x.json") when it isn't. Deliberately
 * does NOT fall back to resolving against `window.location.origin`: that would
 * synthesise the *studio's own* domain and hand the operator a plausible-
 * looking but wrong value — the studio is never the bucket host. A copied
 * misconfiguration fails silently later, once every published story 404s and
 * renders as a transparent gap. Returning null instead lets the caller show
 * the true state (the server isn't configured either) rather than a guess.
 */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export const PublishDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const doc = useStudioDraft((s) => s.doc);
  const [secret, setSecret] = useState(readSecret);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublishOutcome | null>(null);
  const [copied, setCopied] = useState(false);

  const id = slugifyStoryId(doc.title);

  const checks: Check[] = [
    { ok: doc.title.trim().length > 0, msg: 'The story has a title' },
    { ok: doc.frames.length >= 1, msg: `It has at least one frame (${doc.frames.length})` },
    {
      ok: doc.frames.every((f) => f.line.trim().length > 0),
      msg: 'Every frame has narration',
    },
    {
      ok: doc.frames.every((f) => f.art.includes('<svg')),
      msg: 'Every frame has art',
    },
  ];
  const ready = checks.every((c) => c.ok);

  const frameCount = doc.frames.length;
  const words = doc.frames.reduce(
    (n, f) => n + (f.line.trim() ? f.line.trim().split(/\s+/).length : 0),
    0,
  );
  const assetCount = Object.keys(doc.assets ?? {}).length;
  const sizeKb = Math.round(JSON.stringify(doc).length / 1024);

  const publish = async (): Promise<void> => {
    setBusy(true);
    rememberSecret(secret);
    const outcome = await publishStory(doc, id, secret);
    setResult(outcome);
    setBusy(false);
  };

  // Only meaningful (and only computed) once a publish has actually succeeded.
  const originHint = result?.ok === true ? originOf(result.url) : null;

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
    <div className="st-modal on" role="dialog" aria-label="Publish">
      <div className="st-modalbox st-narrow">
        <div className="st-modalhead">
          <h2>PUBLISH</h2>
          <button className="st-closex" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {result?.ok === true ? (
          <>
            <p className="st-msub">
              Live. Anyone opening this link on a phone walks your story.
            </p>
            <label className="st-lbl" htmlFor="st-pub-link">
              Visitor link
            </label>
            <div className="st-linkrow">
              <input id="st-pub-link" readOnly value={result.viewUrl} onFocus={(e) => e.target.select()} />
              <button className="st-btn green" onClick={() => void copy(result.viewUrl)}>
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>
            {!isStoryHostConfigured() && (
              <div className="st-warn">
                <b>One setup step left.</b>{' '}
                {originHint !== null ? (
                  <>
                    The story is saved, but visitors opening the link will still see the bundled
                    demo until the app knows where published stories live. Set{' '}
                    <code>VITE_STORY_BASE_URL</code> to the origin below, then redeploy.
                    <div className="st-linkrow st-mt">
                      <input readOnly value={originHint} onFocus={(e) => e.target.select()} />
                      <button className="st-btn green" onClick={() => void copy(originHint)}>
                        COPY
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    The story is saved, but the server doesn't know its own public URL yet, so
                    this dialog can't show it either. Set <code>STORY_PUBLIC_BASE_URL</code> in
                    the server environment, then republish.
                  </>
                )}
              </div>
            )}

            <div className="st-statline">
              Republishing with the same title replaces this story. Change the title to publish a
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
            <p className="st-msub">Checks first, then your shareable link.</p>

            <ul className="st-checks">
              {checks.map((c) => (
                <li key={c.msg}>
                  <span className={c.ok ? 'st-ok' : 'st-bad'}>{c.ok ? '✔' : '✖'}</span> {c.msg}
                </li>
              ))}
            </ul>

            <div className="st-statline">
              {frameCount} frame{frameCount === 1 ? '' : 's'} · {words} words · {assetCount} upload
              {assetCount === 1 ? '' : 's'} · {sizeKb} KB · publishes as{' '}
              <code>/?s={id}</code>
            </div>

            <label className="st-lbl" htmlFor="st-pub-secret">
              Publish key
            </label>
            <input
              id="st-pub-secret"
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
                title={ready ? 'Publish this story' : 'Fix the ✖ items first'}
              >
                {busy ? 'PUBLISHING…' : '⬆ PUBLISH'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
