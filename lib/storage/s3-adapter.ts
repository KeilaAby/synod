import 'server-only';

import { createHmac, createHash } from 'node:crypto';
import { envServeur } from '@/lib/env';
import { ko, ok, type ActionResult } from '@/lib/domain/result';
import { DUREE_URL_SIGNEE_SECONDES, type OptionsDepot, type StorageAdapter } from './types';

/**
 * Adaptateur de stockage S3 standard — ENF-POR-03.
 *
 * Compatible avec :
 * - AWS S3
 * - MinIO
 * - Cloudflare R2
 * - Scaleway Object Storage
 * - Tout service compatible S3 API v4.
 *
 * N'utilise AUCUNE bibliothèque propriétaire : implémente la signature AWS SigV4
 * en TypeScript pur avec les primitives standard `node:crypto` et `fetch`.
 */

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function getSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac('AWS4' + secretKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  return kSigning;
}

export class S3StorageAdapter implements StorageAdapter {
  private get config() {
    const env = envServeur();
    return {
      endpoint: env.S3_ENDPOINT || 'https://s3.amazonaws.com',
      region: env.S3_REGION || 'us-east-1',
      accessKeyId: env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: env.S3_SECRET_ACCESS_KEY || '',
      bucket: env.S3_BUCKET || env.STORAGE_BUCKET || 'synod',
      forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    };
  }

  private buildUrl(cle: string): { url: URL; host: string } {
    const { endpoint, bucket, forcePathStyle } = this.config;
    const cleanEndpoint = endpoint.replace(/\/$/, '');
    const cleanCle = cle.replace(/^\//, '');

    let urlString: string;
    if (forcePathStyle) {
      urlString = `${cleanEndpoint}/${bucket}/${cleanCle}`;
    } else {
      const urlParsed = new URL(cleanEndpoint);
      urlString = `${urlParsed.protocol}//${bucket}.${urlParsed.host}/${cleanCle}`;
    }

    const url = new URL(urlString);
    return { url, host: url.host };
  }

  private signHeaders(
    method: string,
    url: URL,
    headers: Record<string, string>,
    payloadHash: string,
  ): Record<string, string> {
    const { accessKeyId, secretAccessKey, region } = this.config;
    if (!accessKeyId || !secretAccessKey) {
      return headers;
    }

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    const signedHeadersList: Record<string, string> = {
      ...headers,
      host: url.host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
    };

    const sortedHeaderKeys = Object.keys(signedHeadersList)
      .map((k) => k.toLowerCase())
      .sort();
    const canonicalHeaders = sortedHeaderKeys
      .map((k) => `${k}:${signedHeadersList[k].trim()}\n`)
      .join('');
    const signedHeadersStr = sortedHeaderKeys.join(';');

    const canonicalRequest = [
      method,
      url.pathname,
      url.search.replace(/^\?/, ''),
      canonicalHeaders,
      signedHeadersStr,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = getSigningKey(secretAccessKey, dateStamp, region, 's3');
    const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

    return {
      ...signedHeadersList,
      authorization: authHeader,
    };
  }

  async put(
    cle: string,
    contenu: Blob | ArrayBuffer | Uint8Array,
    options?: OptionsDepot,
  ): Promise<ActionResult<string>> {
    try {
      const { url } = this.buildUrl(cle);
      const buffer =
        contenu instanceof Blob
          ? Buffer.from(await contenu.arrayBuffer())
          : contenu instanceof ArrayBuffer
            ? Buffer.from(contenu)
            : Buffer.from(contenu);

      const contentType = options?.contentType || 'application/octet-stream';
      const payloadHash = sha256Hex(buffer);

      const headers = this.signHeaders(
        'PUT',
        url,
        {
          'content-type': contentType,
          'content-length': String(buffer.length),
        },
        payloadHash,
      );

      const response = await fetch(url.toString(), {
        method: 'PUT',
        headers,
        body: buffer,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return ko(`Erreur de stockage S3 (${response.status}) : ${errorText}`);
      }

      return ok(cle);
    } catch (err) {
      return ko(err instanceof Error ? err.message : 'Erreur S3 inconnue');
    }
  }

  async signedUrl(cle: string, dureeSecondes = DUREE_URL_SIGNEE_SECONDES): Promise<ActionResult<string>> {
    try {
      const { url } = this.buildUrl(cle);
      const { accessKeyId, secretAccessKey, region } = this.config;

      if (!accessKeyId || !secretAccessKey) {
        return ok(url.toString());
      }

      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
      const dateStamp = amzDate.substring(0, 8);
      const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

      url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
      url.searchParams.set('X-Amz-Credential', `${accessKeyId}/${credentialScope}`);
      url.searchParams.set('X-Amz-Date', amzDate);
      url.searchParams.set('X-Amz-Expires', String(dureeSecondes));
      url.searchParams.set('X-Amz-SignedHeaders', 'host');

      const canonicalQueryString = Array.from(url.searchParams.entries())
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .sort()
        .join('&');

      const canonicalHeaders = `host:${url.host}\n`;
      const canonicalRequest = [
        'GET',
        url.pathname,
        canonicalQueryString,
        canonicalHeaders,
        'host',
        'UNSIGNED-PAYLOAD',
      ].join('\n');

      const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        sha256Hex(canonicalRequest),
      ].join('\n');

      const signingKey = getSigningKey(secretAccessKey, dateStamp, region, 's3');
      const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

      url.searchParams.set('X-Amz-Signature', signature);

      return ok(url.toString());
    } catch (err) {
      return ko(err instanceof Error ? err.message : 'Erreur signature S3');
    }
  }

  async signedUrls(
    cles: readonly string[],
    dureeSecondes = DUREE_URL_SIGNEE_SECONDES,
  ): Promise<ActionResult<Map<string, string>>> {
    const table = new Map<string, string>();
    const promises = cles.map(async (cle) => {
      const res = await this.signedUrl(cle, dureeSecondes);
      if (res.ok) {
        table.set(cle, res.data);
      }
    });

    await Promise.all(promises);
    return ok(table);
  }

  async delete(cle: string): Promise<ActionResult<void>> {
    try {
      const { url } = this.buildUrl(cle);
      const payloadHash = sha256Hex('');
      const headers = this.signHeaders('DELETE', url, {}, payloadHash);

      const response = await fetch(url.toString(), {
        method: 'DELETE',
        headers,
      });

      if (!response.ok && response.status !== 404 && response.status !== 204) {
        const errorText = await response.text();
        return ko(`Erreur suppression S3 (${response.status}) : ${errorText}`);
      }

      return ok(undefined);
    } catch (err) {
      return ko(err instanceof Error ? err.message : 'Erreur suppression S3');
    }
  }

  async list(prefixe: string): Promise<ActionResult<string[]>> {
    try {
      const { url } = this.buildUrl('');
      url.searchParams.set('list-type', '2');
      if (prefixe) {
        url.searchParams.set('prefix', prefixe);
      }

      const payloadHash = sha256Hex('');
      const headers = this.signHeaders('GET', url, {}, payloadHash);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return ko(`Erreur listage S3 (${response.status}) : ${errorText}`);
      }

      const xml = await response.text();
      const keys: string[] = [];
      const regex = /<Key>(.*?)<\/Key>/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(xml)) !== null) {
        keys.push(match[1]);
      }

      return ok(keys);
    } catch (err) {
      return ko(err instanceof Error ? err.message : 'Erreur listage S3');
    }
  }

  async download(cle: string): Promise<ActionResult<{ base64: string; contentType: string }>> {
    try {
      const { url } = this.buildUrl(cle);
      const payloadHash = sha256Hex('');
      const headers = this.signHeaders('GET', url, {}, payloadHash);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        return ko(`Fichier introuvable (${response.status}) : ${cle}`);
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      return ok({ base64, contentType });
    } catch (err) {
      return ko(err instanceof Error ? err.message : 'Erreur telechargement S3');
    }
  }
}

export const s3StorageAdapter = new S3StorageAdapter();
