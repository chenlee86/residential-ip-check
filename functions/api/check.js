import { isIP, SocketAddress } from 'node:net';

const networks = {
  US: {
    'Comcast Xfinity': [7922], 'Charter Spectrum': [33363,20115], 'AT&T': [7018],
    Verizon: [701,702,19262], Cox: [22773], Astound: [6079], Frontier: [5650,22677],
    Mediacom: [30036], 'WOW!': [12083], Optimum: [19108,6128,11804],
    'T-Mobile': [21928], Starlink: [14593], HughesNet: [6629], Viasat: [30060],
  },
  GB: {
    'BT / EE': [2856], 'Virgin Media': [5089], Sky: [5607], TalkTalk: [13285],
    Vodafone: [5378], Plusnet: [6871], Zen: [13037], 'Community Fibre': [201838], YouFibre: [212655],
  },
  DE: {
    'Deutsche Telekom': [3320], Vodafone: [3209], 'Telefónica': [6805], '1&1 Versatel': [8881],
    'EWE TEL': [9145], NetCologne: [8422], 'M-net': [8767],
  },
  HK: { 'PCCW / HKT': [4760], HKBN: [9269], HGC: [9304], 'i-CABLE': [9908], CMHK: [9231,131872] },
};

const domains = {
  'Comcast Xfinity': ['comcast.net'], 'Charter Spectrum': ['rr.com','spectrum.com'],
  'AT&T': ['att.net','sbcglobal.net'], Verizon: ['verizon.net'], Cox: ['cox.net'],
  Astound: ['rcn.com'], Frontier: ['frontiernet.net'], Mediacom: ['mediacomcable.com'],
  'WOW!': ['wowway.com'], Optimum: ['suddenlink.net','optimum.net'], 'T-Mobile': ['tmobile.net'],
  Starlink: ['starlinkisp.net'], HughesNet: ['hughes.net'], Viasat: ['viasat.com'],
  'BT / EE': ['btcentralplus.com'], 'Virgin Media': ['virginm.net'], Sky: ['skybroadband.com'],
  TalkTalk: ['as13285.net'], 'Deutsche Telekom': ['t-ipconnect.de'],
  Vodafone: ['vodafone-ip.de','superkabel.de'], 'Telefónica': ['mediaways.net'],
  '1&1 Versatel': ['versatel.de'], 'PCCW / HKT': ['netvigator.com'], HKBN: ['ctinets.com'],
  HGC: ['hgc.com.hk','hgcbroadband.com'], 'i-CABLE': ['hkcable.com.hk'],
};

const business = { 4515: 'PCCW Business', 9381: 'HKBN Enterprise Solutions' };
const hosting = {
  24940: 'Hetzner', 51167: 'Contabo', 60068: 'Datacamp', 14061: 'DigitalOcean',
  16509: 'AWS', 14618: 'AWS', 20473: 'Vultr', 13335: 'Cloudflare', 15169: 'Google',
};

function reverseName(ip, version) {
  if (version === 4) return ip.split('.').reverse().join('.') + '.in-addr.arpa';
  const address = new SocketAddress({address: ip, family: 'ipv6'}).address;
  const [head, tail] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = tail === undefined ? left : [...left, ...Array(8-left.length-right.length).fill('0'), ...right];
  return groups.map(group => group.padStart(4,'0')).join('').split('').reverse().join('.') + '.ip6.arpa';
}

async function lookup(base, params, headers) {
  const url = new URL(base);
  url.search = new URLSearchParams(params);
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function onRequestPost({ request }) {
  const raw = await request.text();
  if (raw.length > 12000) return Response.json({error:'补充内容过长。'}, {status:413});
  let body;
  try { body = JSON.parse(raw); } catch { return Response.json({error:'请求格式无效。'}, {status:400}); }
  const ip = typeof body?.ip === 'string' ? body.ip.trim() : '';
  const version = ip.includes('%') ? 0 : isIP(ip);
  if (!version) return Response.json({error:'请输入有效的 IPv4 或 IPv6 地址。'}, {status:400});
  const reverse = reverseName(ip, version);
  const [route, dns, geo] = await Promise.all([
    lookup('https://stat.ripe.net/data/network-info/data.json', {resource:ip}),
    lookup('https://cloudflare-dns.com/dns-query', {name:reverse,type:'PTR'}, {Accept:'application/dns-json'}),
    lookup('https://ipwho.is/' + encodeURIComponent(ip), {fields:'success,country_code,connection'}),
  ]);
  const asns = (route?.data?.asns ?? []).map(Number);
  const asn = asns.length === 1 ? asns[0] : undefined;
  const country = geo?.success ? geo.country_code : undefined;
  const provider = Object.entries(networks[country] ?? {}).find(([, ids]) => ids.includes(asn))?.[0];
  const knownBusiness = country === 'HK' ? business[asn] : undefined;
  const knownHosting = hosting[asn];
  const ptr = (dns?.Answer ?? []).filter(item => item.type === 12).map(item => item.data.toLowerCase().replace(/\.$/,''));
  const matching = ptr.filter(name => domains[provider]?.some(domain => name === domain || name.endsWith('.'+domain)));
  const dynamic = matching.some(name => /(?:^|[.-])(?:hsd1|dip0|dslb|pools?|cust|cable|dynamic|cm)(?:[.\d-]|$)/.test(name));
  const staticHint = ptr.some(name => /(?:^|[.-])(?:static|dedicated|vps|cloud)(?:[.-]|$)/.test(name));
  const details = typeof body.details === 'string' ? body.details.trim().slice(0,2000) : '';
  let status = 'unknown';
  if (knownHosting) status = 'hosting';
  else if (knownBusiness) status = 'business';
  else if (provider && dynamic && !staticHint) status = 'residential';
  const advice = {
    unknown: '现有证据不足以确认接入类型。可补充运营商分配记录或接入层路由进行人工核验。',
    hosting: '当前 BGP 起源匹配已知云或托管网络。作为住宅接入使用前，应核对实际分配记录。',
    business: '当前起源匹配香港企业网络参考名单。具体线路类型可向运营商确认。',
    residential: '地区、起源 ASN 和动态 PTR 一致，符合住宅接入特征。具体线路归属仍以运营商分配记录为准。',
  };
  return Response.json({
    ip, status, country: country || '未知',
    operator: provider || knownBusiness || knownHosting || geo?.connection?.isp || '未知',
    asns,
    asnEvidence: provider ? '匹配该地区家宽运营商参考名单。' :
      knownHosting || knownBusiness ? '匹配已知云、托管或企业网络参考名单。' :
      asns.length > 1 ? '观测到多个起源 ASN，需要进一步核验。' :
      asn ? '未命中该地区参考名单或地区未知。' : '未取得 BGP 起源 ASN。',
    ptrEvidence: ptr.length ? ptr.join('、') + (staticHint ? '（含静态或托管命名线索）' :
      dynamic ? '（匹配运营商动态接入命名）' : matching.length ? '（匹配运营商后缀）' : '') :
      dns?.Status === 0 || dns?.Status === 3 ? '无 PTR 记录。' : '反向 DNS 查询未取得结果。',
    routeEvidence: [route?.data?.prefix ? 'BGP 前缀 ' + route.data.prefix : '未取得 BGP 前缀',
      details ? '以下为用户提供的 WHOIS 或路由记录，需人工核对。' : '未提供 WHOIS 或 traceroute。'].join('。'),
    details, advice: advice[status],
  }, { headers: {'Cache-Control':'no-store'} });
}
