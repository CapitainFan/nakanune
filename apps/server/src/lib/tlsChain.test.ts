import { describe, expect, it } from 'vitest';
import { caIssuersUrl } from './tlsChain';

describe('caIssuersUrl', () => {
  it('берёт ссылку на издателя из AIA — как в сертификате edummf.bsu.by', () => {
    expect(
      caIssuersUrl(
        'CA Issuers - URI:http://secure.globalsign.com/cacert/gsrsaovsslca2018.crt\nOCSP - URI:http://ocsp.globalsign.com/gsrsaovsslca2018',
      ),
    ).toBe('http://secure.globalsign.com/cacert/gsrsaovsslca2018.crt');
  });

  it('нет ссылки или не http(s) — null', () => {
    expect(caIssuersUrl(undefined)).toBeNull();
    expect(caIssuersUrl('OCSP - URI:http://ocsp.example.com')).toBeNull();
    expect(caIssuersUrl('CA Issuers - URI:ldap://example.com/ca')).toBeNull();
  });
});
