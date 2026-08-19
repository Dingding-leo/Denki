import {
  MEDIA_REFERENCE_PREFIX,
  acquireMediaObjectUrl,
  parseMediaReference,
  type MediaObjectUrlLease,
} from './mediaRegistry';

export const MAX_MEDIA_REFERENCES_PER_RENDER = 256;

const VALID_REFERENCE_PATTERN = new RegExp(
  `${MEDIA_REFERENCE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-f0-9]{64}`,
  'g',
);
const URI_ATTRIBUTES = ['src', 'poster', 'href'] as const;
type MediaUriAttribute = (typeof URI_ATTRIBUTES)[number];

const HYDRATABLE_SELECTOR = URI_ATTRIBUTES
  .map((attribute) => `[data-denki-media-${attribute}]`)
  .join(',');

interface TokenizedMediaSource {
  source: string;
  tokens: ReadonlyMap<string, string | null>;
}

interface MediaBinding {
  attribute: MediaUriAttribute;
  reference: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function chooseTokenPrefix(source: string): string {
  let prefix = 'DENKIMEDIAREFERENCE';
  while (source.includes(prefix)) prefix += 'X';
  return prefix;
}

/**
 * Replace valid registry references with sanitizer-safe opaque tokens. Tokens
 * are converted into trusted data attributes only after DOMPurify has finished.
 */
export function tokenizeMediaReferences(
  source: string,
): TokenizedMediaSource {
  if (!source.includes(MEDIA_REFERENCE_PREFIX)) {
    return { source, tokens: new Map() };
  }

  const prefix = chooseTokenPrefix(source);
  const tokens = new Map<string, string | null>();
  const omittedToken = `${prefix}OMITTEDEND`;
  let acceptedCount = 0;

  const tokenized = source.replace(VALID_REFERENCE_PATTERN, (reference) => {
    if (acceptedCount >= MAX_MEDIA_REFERENCES_PER_RENDER) {
      tokens.set(omittedToken, null);
      return omittedToken;
    }

    const token = `${prefix}${acceptedCount}END`;
    acceptedCount += 1;
    tokens.set(token, reference);
    return token;
  });

  return { source: tokenized, tokens };
}

function tokenMatcher(tokens: ReadonlyMap<string, string | null>): RegExp | null {
  if (tokens.size === 0) return null;
  return new RegExp(
    [...tokens.keys()].map(escapeRegex).join('|'),
    'g',
  );
}

function restoreTokenText(
  value: string,
  tokens: ReadonlyMap<string, string | null>,
  matcher: RegExp,
): string {
  matcher.lastIndex = 0;
  return value.replace(matcher, (token) =>
    tokens.get(token) ?? '[ media unavailable ]',
  );
}

function fallbackTarget(element: Element): Element {
  if (element.tagName === 'SOURCE') {
    return element.closest('picture, audio, video') ?? element;
  }
  return element;
}

function createFallbackElement(
  ownerDocument: Document,
  target: Element,
  label = 'Media unavailable',
): HTMLSpanElement {
  const fallback = ownerDocument.createElement('span');
  fallback.className = 'denki-media-fallback';
  fallback.setAttribute('role', 'status');
  fallback.setAttribute('aria-label', label);

  const alt = target.getAttribute('alt')?.trim();
  fallback.textContent = alt ? `${label}: ${alt.slice(0, 160)}` : label;
  return fallback;
}

function isAllowedBinding(
  element: Element,
  attribute: MediaUriAttribute,
): boolean {
  if (attribute === 'poster') return element.tagName === 'VIDEO';
  if (attribute === 'href') return element.tagName === 'A';
  return ['IMG', 'AUDIO', 'VIDEO', 'SOURCE'].includes(element.tagName);
}

/**
 * Convert post-sanitization tokens in URI attributes into inert data bindings.
 * Registry URLs never reach a browser network attribute before verification.
 */
export function prepareRenderedMediaHtml(
  sanitizedHtml: string,
  tokens: ReadonlyMap<string, string | null>,
): string {
  const matcher = tokenMatcher(tokens);
  if (!matcher || typeof document === 'undefined') return sanitizedHtml;

  const template = document.createElement('template');
  template.innerHTML = sanitizedHtml;
  const invalidTargets = new Set<Element>();

  for (const element of template.content.querySelectorAll('*')) {
    for (const attribute of URI_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (!value) continue;

      const exactReference = tokens.get(value);
      if (tokens.has(value)) {
        if (
          exactReference === null ||
          !isAllowedBinding(element, attribute)
        ) {
          invalidTargets.add(fallbackTarget(element));
          element.removeAttribute(attribute);
          continue;
        }

        element.removeAttribute(attribute);
        element.setAttribute(
          `data-denki-media-${attribute}`,
          exactReference,
        );
        element.setAttribute('data-denki-media-state', 'pending');
        element.setAttribute('aria-busy', 'true');
        continue;
      }

      matcher.lastIndex = 0;
      if (matcher.test(value)) {
        // A token embedded inside a larger URI was not an exact Denki reference.
        // Do not restore it after sanitization and accidentally create a custom
        // protocol URL with an unvalidated suffix.
        element.removeAttribute(attribute);
        invalidTargets.add(fallbackTarget(element));
      }
    }

    // Restore registry-reference text in non-URI attributes (for example alt or
    // title) after sanitization. User data-* attributes have already been removed.
    for (const attribute of [...element.attributes]) {
      if (URI_ATTRIBUTES.includes(attribute.name as MediaUriAttribute)) continue;
      matcher.lastIndex = 0;
      if (!matcher.test(attribute.value)) continue;
      element.setAttribute(
        attribute.name,
        restoreTokenText(attribute.value, tokens, matcher),
      );
    }
  }

  const walker = document.createTreeWalker(
    template.content,
    NodeFilter.SHOW_TEXT,
  );
  let textNode = walker.nextNode();
  while (textNode) {
    const value = textNode.nodeValue ?? '';
    matcher.lastIndex = 0;
    if (matcher.test(value)) {
      textNode.nodeValue = restoreTokenText(value, tokens, matcher);
    }
    textNode = walker.nextNode();
  }

  for (const target of invalidTargets) {
    if (!target.parentNode) continue;
    target.replaceWith(
      createFallbackElement(document, target),
    );
  }

  return template.innerHTML;
}

function readBindings(element: Element): MediaBinding[] {
  const bindings: MediaBinding[] = [];
  for (const attribute of URI_ATTRIBUTES) {
    const dataAttribute = `data-denki-media-${attribute}`;
    const value = element.getAttribute(dataAttribute);
    if (!value) continue;

    // parseMediaReference throws on malformed values. Data attributes are added
    // by trusted post-sanitization code, but local DOM mutation is still treated
    // as untrusted at the hydration boundary.
    if (parseMediaReference(value) === null) {
      throw new Error('Media binding does not contain a Denki reference.');
    }
    bindings.push({ attribute, reference: value });
  }
  return bindings;
}

function elementAndDescendants(root: Node): Element[] {
  const elements: Element[] = [];
  if (root instanceof Element) elements.push(root);
  if (root instanceof Element || root instanceof DocumentFragment) {
    elements.push(...root.querySelectorAll('*'));
  }
  return elements;
}

/**
 * Install one document-scoped hydrator for prepared registry bindings. The
 * returned cleanup revokes every lease owned by this hydrator and invalidates
 * all pending element resolutions.
 */
export function installMediaReferenceHydrator(
  root: Document | HTMLElement = document,
): () => void {
  const observationTarget =
    root instanceof Document ? root.documentElement : root;
  const trackedLeases = new Map<Element, MediaObjectUrlLease[]>();
  const pendingTokens = new WeakMap<Element, symbol>();
  let disposed = false;

  const releaseElement = (element: Element) => {
    pendingTokens.delete(element);
    const leases = trackedLeases.get(element);
    if (!leases) return;
    trackedLeases.delete(element);
    for (const lease of leases) lease.release();
  };

  const releaseTree = (node: Node) => {
    for (const element of elementAndDescendants(node)) {
      releaseElement(element);
    }
  };

  const replaceWithFallback = (element: Element) => {
    const target = fallbackTarget(element);
    releaseTree(target);
    if (!target.parentNode) return;
    target.replaceWith(
      createFallbackElement(target.ownerDocument, target),
    );
  };

  const hydrateElement = async (element: Element) => {
    if (
      disposed ||
      trackedLeases.has(element) ||
      pendingTokens.has(element)
    ) {
      return;
    }

    let bindings: MediaBinding[];
    try {
      bindings = readBindings(element);
    } catch (error) {
      console.warn('[Denki media] Invalid prepared media binding:', error);
      replaceWithFallback(element);
      return;
    }
    if (bindings.length === 0) return;

    const token = Symbol('media-hydration');
    pendingTokens.set(element, token);
    const uniqueReferences = [
      ...new Set(bindings.map((binding) => binding.reference)),
    ];

    const results = await Promise.all(
      uniqueReferences.map(async (reference) => {
        try {
          return {
            reference,
            lease: await acquireMediaObjectUrl(reference),
            error: null as unknown,
          };
        } catch (error) {
          return { reference, lease: null, error };
        }
      }),
    );

    const acquired = results.flatMap((result) =>
      result.lease ? [result.lease] : [],
    );
    if (
      disposed ||
      pendingTokens.get(element) !== token ||
      !element.isConnected
    ) {
      for (const lease of acquired) lease.release();
      return;
    }
    pendingTokens.delete(element);

    const failed = results.find((result) => !result.lease);
    if (failed) {
      for (const lease of acquired) lease.release();
      if (failed.error) {
        console.warn(
          `[Denki media] Could not resolve ${failed.reference}:`,
          failed.error,
        );
      }
      replaceWithFallback(element);
      return;
    }

    const urlByReference = new Map(
      results.map((result) => [result.reference, result.lease!.url]),
    );
    for (const { attribute, reference } of bindings) {
      const url = urlByReference.get(reference);
      if (!url) {
        for (const lease of acquired) lease.release();
        replaceWithFallback(element);
        return;
      }
      element.setAttribute(attribute, url);
      element.removeAttribute(`data-denki-media-${attribute}`);
    }

    element.setAttribute('data-denki-media-state', 'ready');
    element.removeAttribute('aria-busy');
    trackedLeases.set(element, acquired);
  };

  const scan = (node: Node) => {
    for (const element of elementAndDescendants(node)) {
      if (element.matches(HYDRATABLE_SELECTOR)) {
        void hydrateElement(element);
      }
    }
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const removed of mutation.removedNodes) releaseTree(removed);
      for (const added of mutation.addedNodes) scan(added);
    }
  });

  observer.observe(observationTarget, {
    childList: true,
    subtree: true,
  });
  scan(observationTarget);

  return () => {
    disposed = true;
    observer.disconnect();
    for (const leases of trackedLeases.values()) {
      for (const lease of leases) lease.release();
    }
    trackedLeases.clear();
  };
}
