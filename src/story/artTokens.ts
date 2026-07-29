/**
 * artTokens.ts — asset tokens in composed SVG art.
 *
 * Composed art references uploaded images by an opaque alias rather than by
 * bytes or by URL:
 *
 *     <image href="asset:logo" .../>
 *
 * Two constraints meet here. Documents must stay small, so bytes cannot be
 * inlined at authoring time. And an SVG rasterized through `<img>` runs in
 * restricted mode and will NOT fetch external references — an https source
 * renders blank, silently — so bytes MUST be inline at rasterization time.
 * A token plus a late substitution pass satisfies both.
 *
 * Pure string logic: no DOM, no network, no engine. The regex is deliberately
 * bounded to the attribute form and a restricted alias charset, so nothing
 * else in the document can be matched or rewritten.
 */

/** Aliases are document-local names. Kept URL- and attribute-safe. */
export const ASSET_ALIAS_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Matches `href="asset:NAME"` and `xlink:href="asset:NAME"`.
 *
 * Anchored on the attribute name and the opening quote so the literal text
 * `asset:` elsewhere in the document — inside a <text> element, say — is never
 * mistaken for a reference.
 */
const TOKEN_RE = /(\bxlink:href|\bhref)="asset:([A-Za-z0-9_-]{1,64})"/g;

/** 1x1 fully transparent PNG. Stands in for an asset that failed to resolve. */
export const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Escapes the characters that would break out of a double-quoted attribute. */
function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Lists the asset aliases an art string references.
 *
 * @param art — A composed SVG document string.
 * @returns Unique aliases in first-seen order. Empty when the art references
 *   no assets, which is the case for all hand-drawn era scenes.
 */
export function collectAssetRefs(art: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // A /g regex carries lastIndex across calls; a fresh instance keeps this
  // function reentrant.
  const re = new RegExp(TOKEN_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(art)) !== null) {
    const alias = m[2];
    if (seen.has(alias)) continue;
    seen.add(alias);
    out.push(alias);
  }
  return out;
}

/**
 * Replaces every asset token with its resolved `data:` URL.
 *
 * Call immediately before rasterization and discard the result — a hydrated
 * string carries the full image payload and must never be persisted or put
 * back into the document.
 *
 * @param art — A composed SVG document string.
 * @param resolved — Alias to `data:` URL. An alias absent from the map is
 *   replaced with {@link TRANSPARENT_PIXEL}: a gap in the art is recoverable,
 *   a document that fails to parse is not.
 * @returns The art with every token substituted.
 */
export function hydrateArt(art: string, resolved: ReadonlyMap<string, string>): string {
  const re = new RegExp(TOKEN_RE.source, 'g');
  return art.replace(re, (_full, attr: string, alias: string) => {
    const href = resolved.get(alias) ?? TRANSPARENT_PIXEL;
    return `${attr}="${escapeAttr(href)}"`;
  });
}
