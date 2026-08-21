import { expect, test, type Page } from '@playwright/test';

const PRESENCE_STORAGE_KEY = 'denki-maintenance-presence-v1';

async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers are unavailable in this browser.');
    }
    await navigator.serviceWorker.ready;
  });

  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({ waitUntil: 'networkidle' });
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

async function assertCompleteReleaseCache(page: Page): Promise<void> {
  const missing = await page.evaluate(async () => {
    const cacheNames = (await caches.keys()).filter((name) =>
      name.startsWith('denki-cache-'),
    );
    if (cacheNames.length !== 1) {
      throw new Error(
        `Expected one active Denki release cache, found ${cacheNames.length}.`,
      );
    }

    const base = new URL('./', location.href);
    const manifestResponse = await fetch(new URL('sw-assets.json', base), {
      cache: 'no-store',
    });
    if (!manifestResponse.ok) {
      throw new Error(`sw-assets.json returned ${manifestResponse.status}.`);
    }
    const manifest = (await manifestResponse.json()) as { assets?: unknown };
    if (!Array.isArray(manifest.assets)) {
      throw new Error('sw-assets.json does not contain an assets array.');
    }

    const required = [
      base.href,
      new URL('index.html', base).href,
      new URL('manifest.webmanifest', base).href,
      new URL('version.json', base).href,
      new URL('denki_logo.png', base).href,
      ...manifest.assets.map((asset) => new URL(String(asset), base).href),
    ];
    const cache = await caches.open(cacheNames[0]);
    const results = await Promise.all(
      [...new Set(required)].map(async (url) => ({
        url,
        present: Boolean(await cache.match(url, { ignoreVary: true })),
      })),
    );
    return results.filter((result) => !result.present).map((result) => result.url);
  });

  expect(missing).toEqual([]);
}

async function countIndexedDbRows(
  page: Page,
  storeName: string,
): Promise<number> {
  return page.evaluate(
    (requestedStore) =>
      new Promise<number>((resolve, reject) => {
        const openRequest = indexedDB.open('DenkiDatabase');
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const transaction = database.transaction(requestedStore, 'readonly');
          const countRequest = transaction.objectStore(requestedStore).count();
          countRequest.onerror = () => reject(countRequest.error);
          countRequest.onsuccess = () => resolve(countRequest.result);
          transaction.oncomplete = () => database.close();
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    storeName,
  );
}

function liveForeignPresence(label: string) {
  const now = Date.now();
  return {
    version: 1,
    ownerId: `e2e-foreign-${now}`,
    fence: 1,
    operation: 'e2e-maintenance',
    label,
    startedAt: now,
    updatedAt: now,
    expiresAt: now + 30_000,
  };
}

test('production shell, release identity, and lazy routes survive a true offline reload', async ({
  page,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Playwright baseURL is required.');
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await expect(
    page.getByRole('heading', { name: 'The Study Desk' }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/Denki/);

  const releaseUrl = new URL('version.json', baseURL).toString();
  const release = await page.evaluate(async (url) => {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`version.json returned ${response.status}`);
    return response.json() as Promise<{ version: string; buildId: string }>;
  }, releaseUrl);
  expect(release.version).toMatch(/^\d+\.\d+\.\d+(?:[-+].+)?$/);
  expect(release.buildId).toMatch(/^[a-f0-9]{12}$/);

  await waitForServiceWorkerControl(page);
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await caches.keys()).some((name) => name.startsWith('denki-cache-')),
      ),
    )
    .toBe(true);
  await assertCompleteReleaseCache(page);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(page.url()).toBe(baseURL);
    await expect(
      page.getByRole('heading', { name: 'The Study Desk' }),
    ).toBeVisible();

    const cachedRelease = await page.evaluate(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`offline version.json returned ${response.status}`);
      return response.json() as Promise<{ version: string; buildId: string }>;
    }, releaseUrl);
    expect(cachedRelease).toEqual(release);

    await page.goto(new URL('ai-generate', baseURL).toString(), {
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { name: 'Cut notes into cards.' }),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
  }

  expect(pageErrors).toEqual([]);
});

test('a foreign maintenance marker fences writes and blocks another real tab', async ({
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Playwright baseURL is required.');
  const ownerPage = await context.newPage();
  const foreignPage = await context.newPage();
  await Promise.all([
    ownerPage.goto(baseURL, { waitUntil: 'networkidle' }),
    foreignPage.goto(baseURL, { waitUntil: 'networkidle' }),
  ]);

  const writeError = foreignPage.waitForEvent('pageerror');
  await foreignPage.evaluate(
    ({ key, marker }) => {
      localStorage.setItem(key, JSON.stringify(marker));
      const button = [...document.querySelectorAll('button')].find(
        (candidate) => candidate.textContent?.trim() === 'Load sample issue',
      );
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error('Load sample issue button was not found.');
      }
      button.click();
    },
    {
      key: PRESENCE_STORAGE_KEY,
      marker: liveForeignPresence('E2E write fence'),
    },
  );

  expect((await writeError).message).toMatch(/another Denki tab is running/i);
  await expect.poll(() => countIndexedDbRows(foreignPage, 'classes')).toBe(0);
  await foreignPage.evaluate((key) => localStorage.removeItem(key), PRESENCE_STORAGE_KEY);
  await foreignPage.reload({ waitUntil: 'networkidle' });

  const marker = liveForeignPresence('Portable backup restore');
  await ownerPage.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: PRESENCE_STORAGE_KEY, value: marker },
  );

  await expect(
    foreignPage.getByRole('alertdialog', {
      name: 'Another Denki tab is updating the library',
    }),
  ).toBeVisible();
  await expect(foreignPage.getByText(/Portable backup restore/)).toBeVisible();

  const reloaded = foreignPage.waitForNavigation({
    waitUntil: 'domcontentloaded',
  });
  await ownerPage.evaluate((key) => localStorage.removeItem(key), PRESENCE_STORAGE_KEY);
  await reloaded;
  await expect(
    foreignPage.getByRole('heading', { name: 'The Study Desk' }),
  ).toBeVisible();
});
