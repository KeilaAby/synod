import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3StorageAdapter } from '@/lib/storage/s3-adapter';

describe('S3StorageAdapter — ENF-POR-03', () => {
  let adapter: S3StorageAdapter;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.S3_ACCESS_KEY_ID = 'test-s3-access-key-id';
    process.env.S3_SECRET_ACCESS_KEY = 'test-s3-secret-access-key';
    process.env.S3_ENDPOINT = 'https://s3.amazonaws.com';
    process.env.S3_REGION = 'us-east-1';
    adapter = new S3StorageAdapter();
  });

  it('génère une URL signée au format SigV4 valide', async () => {
    const res = await adapter.signedUrl('photos/test-photo.webp', 3600);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const url = new URL(res.data);
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(url.searchParams.has('X-Amz-Signature')).toBe(true);
    expect(url.searchParams.has('X-Amz-Credential')).toBe(true);
    expect(url.pathname).toContain('test-photo.webp');
  });

  it('signe plusieurs URLs en lot sans échouer sur les clés valides', async () => {
    const cles = ['photos/1.webp', 'photos/2.webp', 'justificatifs/piece.pdf'];
    const res = await adapter.signedUrls(cles, 1800);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.size).toBe(3);
    for (const cle of cles) {
      expect(res.data.has(cle)).toBe(true);
      expect(res.data.get(cle)).toContain('X-Amz-Signature');
    }
  });

  it('effectue un put avec les en-têtes signés via fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    const contenu = new Uint8Array([1, 2, 3, 4]);
    const res = await adapter.put('photos/avatar.webp', contenu, {
      contentType: 'image/webp',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toBe('photos/avatar.webp');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, options] = fetchMock.mock.calls[0];
    expect(calledUrl).toContain('photos/avatar.webp');
    expect(options.method).toBe('PUT');
    expect(options.headers['content-type']).toBe('image/webp');
  });

  it('supprime un objet via DELETE', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await adapter.delete('photos/old.webp');
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe('DELETE');
  });

  it('télécharge un objet et retourne le contenu encodé en base64', async () => {
    const encoded = new TextEncoder().encode('hello world S3');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/plain' }),
      arrayBuffer: () => Promise.resolve(encoded.buffer),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await adapter.download('rapports/sample.txt');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.contentType).toBe('text/plain');
    expect(Buffer.from(res.data.base64, 'base64').toString('utf8')).toBe('hello world S3');
  });
});
