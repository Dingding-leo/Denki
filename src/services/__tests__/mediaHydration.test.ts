import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { db } from '../../db';
import {
  MAX_MEDIA_REFERENCES_PER_RENDER,
  installMediaReferenceHydrator,
  tokenizeMediaReferences,
} from '../mediaHydration';
import {
  MEDIA_REFERENCE_PREFIX,
  activeMediaObjectUrlCount,
  registerMediaBytes,
  revokeAllMediaObjectUrls,
} from '../mediaRegistry';
import { renderContent } from '../markdown';

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

function installObjectUrlMocks() {
  let sequence = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => `blob:hydrated-${++sequence}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
}

function restoreObjectUrlApi() {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: originalCreateObjectUrl,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: originalRevokeObjectUrl,
  });
}

describe('mixed media renderer', () => {
  let container: HTMLDivElement;
  let uninstall: (() => void) | null;

  beforeEach(async () => {
    installObjectUrlMocks();
    await db.media.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    uninstall = null;
  });

  afterEach(() => {
    uninstall?.();
    container.remove();
    revokeAllMediaObjectUrls();
    restoreObjectUrlApi();
    vi.restoreAllMocks();
  });

  it('hydrates registry images while leaving ordinary data URLs untouched', async () => {
    const reference = await registerMediaBytes(
      'image/png',
      new Uint8Array([1, 2, 3, 4]),
    );
    const inline = 'data:image/png;base64,AQID';
    container.innerHTML = renderContent(
      `![registry](${reference})\n\n![inline](${inline})`,
      false,
      true,
    );

    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(2);
    expect(images[0].hasAttribute('src')).toBe(false);
    expect(images[0].getAttribute('data-denki-media-src')).toBe(reference);
    expect(images[1].getAttribute('src')).toBe(inline);

    uninstall = installMediaReferenceHydrator(document);

    await waitFor(() => {
      expect(images[0].getAttribute('src')).toBe('blob:hydrated-1');
      expect(images[0].getAttribute('data-denki-media-state')).toBe('ready');
    });
    expect(images[0].hasAttribute('data-denki-media-src')).toBe(false);
    expect(images[0].hasAttribute('aria-busy')).toBe(false);
    expect(images[1].getAttribute('src')).toBe(inline);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('shares one object URL for repeated references and releases it after removal', async () => {
    const reference = await registerMediaBytes(
      'image/png',
      new Uint8Array([5, 6, 7]),
    );
    container.innerHTML = renderContent(
      `![one](${reference})\n\n![two](${reference})`,
      false,
      true,
    );
    uninstall = installMediaReferenceHydrator(document);

    await waitFor(() => {
      const sources = [...container.querySelectorAll('img')].map((image) =>
        image.getAttribute('src'),
      );
      expect(sources).toEqual(['blob:hydrated-1', 'blob:hydrated-1']);
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(activeMediaObjectUrlCount()).toBe(1);

    container.replaceChildren();
    await waitFor(() => {
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:hydrated-1');
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(activeMediaObjectUrlCount()).toBe(0);
  });

  it('shows an accessible fallback when a valid reference is missing', async () => {
    const reference = `${MEDIA_REFERENCE_PREFIX}${'a'.repeat(64)}`;
    container.innerHTML = renderContent(
      `![diagram](${reference})`,
      false,
      true,
    );
    uninstall = installMediaReferenceHydrator(document);

    await waitFor(() => {
      const fallback = container.querySelector('.denki-media-fallback');
      expect(fallback).not.toBeNull();
      expect(fallback?.getAttribute('role')).toBe('status');
      expect(fallback?.textContent).toContain('Media unavailable: diagram');
    });
    expect(container.querySelector('img')).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('fails closed and releases no URL when stored bytes are corrupted', async () => {
    const reference = await registerMediaBytes(
      'image/png',
      new Uint8Array([1, 2, 3]),
    );
    const hash = reference.slice(MEDIA_REFERENCE_PREFIX.length);
    await db.media.update(hash, {
      data: new Uint8Array([9, 9, 9]).buffer,
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    container.innerHTML = renderContent(
      `![corrupt](${reference})`,
      false,
      true,
    );
    uninstall = installMediaReferenceHydrator(document);

    await waitFor(() => {
      expect(container.querySelector('.denki-media-fallback')).not.toBeNull();
    });
    expect(warning).toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(activeMediaObjectUrlCount()).toBe(0);
  });

  it('caps prepared references without growing a token map without bound', () => {
    const references = Array.from(
      { length: MAX_MEDIA_REFERENCES_PER_RENDER + 20 },
      (_, index) =>
        `${MEDIA_REFERENCE_PREFIX}${index.toString(16).padStart(64, '0')}`,
    );
    const tokenized = tokenizeMediaReferences(references.join('\n'));

    expect(tokenized.tokens.size).toBe(MAX_MEDIA_REFERENCES_PER_RENDER + 1);
    expect(
      [...tokenized.tokens.values()].filter((value) => value === null),
    ).toHaveLength(1);
  });
});
