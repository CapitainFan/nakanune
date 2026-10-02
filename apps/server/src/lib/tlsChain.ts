import { X509Certificate } from 'node:crypto';
import { request } from 'node:https';
import { connect, rootCertificates } from 'node:tls';

// Некоторые серверы (например, edummf.bsu.by) присылают только свой сертификат, без
// промежуточного. Браузер в таком случае сам докачивает недостающее звено по ссылке из
// сертификата (AIA, «CA Issuers»), а Node — нет и отвечает UNABLE_TO_VERIFY_LEAF_SIGNATURE.
// Здесь делаем то же, что браузер. Безопасность не страдает: промежуточный сертификат
// скачивается по http, но проверку TLS он проходит, только если цепочка сходится
// к доверенному корневому сертификату — подделку не примут.

const MAX_CERT_BYTES = 64 * 1024;
const TIMEOUT_MS = 10_000;

/** Ссылка на сертификат издателя из поля Authority Information Access. */
export function caIssuersUrl(infoAccess: string | undefined): string | null {
  const url = /CA Issuers - URI:(\S+)/.exec(infoAccess ?? '')?.[1];
  return url && /^https?:\/\//.test(url) ? url : null;
}

// Один раз на хост за жизнь процесса
const cache = new Map<string, Promise<string>>();

/** Промежуточный сертификат (PEM), которого не хватает в цепочке сервера. */
export function missingIntermediate(host: string): Promise<string> {
  let pending = cache.get(host);
  if (!pending) {
    pending = loadIntermediate(host);
    // Не получилось — в следующий раз попробуем снова
    pending.catch(() => cache.delete(host));
    cache.set(host, pending);
  }
  return pending;
}

async function loadIntermediate(host: string): Promise<string> {
  const leaf = await peerCertificate(host);
  const url = caIssuersUrl(leaf.infoAccess);
  if (!url) throw new Error('в сертификате сайта нет ссылки на издателя');

  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`сертификат издателя не скачался (${response.status})`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_CERT_BYTES) throw new Error('сертификат издателя подозрительно большой');

  // Обычно DER, иногда PEM — X509Certificate понимает оба
  const intermediate = new X509Certificate(body);
  // Это действительно издатель сайта: имя совпадает и подпись сайта им проверяется
  if (!intermediate.ca || !leaf.checkIssued(intermediate) || !leaf.verify(intermediate.publicKey)) {
    throw new Error('скачанный сертификат не подходит к сертификату сайта');
  }
  return intermediate.toString();
}

/** Сертификат сервера — без проверки, только чтобы прочитать из него ссылку на издателя. */
function peerCertificate(host: string): Promise<X509Certificate> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: 443, servername: host, rejectUnauthorized: false });
    socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('сайт не ответил')));
    socket.once('secureConnect', () => {
      const certificate = socket.getPeerX509Certificate();
      socket.end();
      if (certificate) resolve(certificate);
      else reject(new Error('сайт не прислал сертификат'));
    });
    socket.once('error', reject);
  });
}

/**
 * GET по https с дополнительным промежуточным сертификатом. Корневые — стандартные
 * (tls.rootCertificates), так что проверка цепочки остаётся полной.
 */
export function httpsGetText(
  url: string,
  options: { intermediate: string; timeoutMs: number; maxBytes: number },
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { ca: [...rootCertificates, options.intermediate], timeout: options.timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            req.destroy(new Error('ответ слишком большой'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () =>
      req.destroy(Object.assign(new Error('timeout'), { name: 'TimeoutError' })),
    );
    req.on('error', reject);
    req.end();
  });
}
