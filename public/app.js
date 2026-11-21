const form = document.querySelector('form');
const button = form.querySelector('button');
const message = document.querySelector('#message');
const report = document.querySelector('#report');
const toggle = document.querySelector('#toggle-evidence');
const evidence = document.querySelector('#evidence');

toggle.addEventListener('click', () => {
  evidence.hidden = !evidence.hidden;
  toggle.setAttribute('aria-expanded', String(!evidence.hidden));
});

const verdicts = {
  residential: '符合原生家宽特征',
  business: '商业宽带（商宽）',
  hosting: '机房或托管网络',
  unknown: '信息不足待补充',
};
const regions = new Intl.DisplayNames(['zh-CN'], {type:'region'});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(form));
  button.disabled = true;
  report.hidden = true;
  message.textContent = '正在查询 ASN 和 PTR…';
  message.hidden = false;
  try {
    const response = await fetch('/api/check', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      message.textContent = result.error || '查询失败，请稍后重试。';
      return;
    }
    const region = /^[A-Z]{2}$/.test(result.country) ? regions.of(result.country) : result.country;
    const asn = result.asns.map(value => 'AS' + value).join(' / ') || 'ASN 未知';
    const fields = {
      verdict: verdicts[result.status],
      'result-ip': result.ip,
      region,
      operator: result.operator,
      'origin-asn': asn,
      asn: result.asnEvidence,
      ptr: result.ptrEvidence,
      route: result.routeEvidence,
      advice: result.advice,
      details: result.details,
    };
    for (const [id, value] of Object.entries(fields)) document.getElementById(id).textContent = value;
    document.querySelector('#details').hidden = !result.details;
    report.dataset.status = result.status;
    report.hidden = false;
    message.hidden = true;
  } catch {
    message.textContent = '查询服务暂时不可用，请稍后重试。';
  } finally {
    button.disabled = false;
  }
});
