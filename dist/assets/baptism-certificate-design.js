(() => {
  function textFrom(node, selector) {
    return node.querySelector(selector)?.textContent?.trim() || '';
  }

  function line(label, value, className = '') {
    const row = document.createElement('div');
    row.className = `certificate-line ${className}`.trim();
    if (label) {
      const span = document.createElement('span');
      span.textContent = label;
      row.appendChild(span);
    }
    const strong = document.createElement('strong');
    strong.textContent = value || '';
    row.appendChild(strong);
    return row;
  }

  function splitLine(parts, className = '') {
    const row = document.createElement('div');
    row.className = `certificate-line ${className}`.trim();
    parts.forEach(part => {
      const label = document.createElement('span');
      label.textContent = part.label;
      row.appendChild(label);
      const value = document.createElement('strong');
      value.textContent = part.value || '';
      row.appendChild(value);
    });
    return row;
  }

  function blankLines(count) {
    const wrap = document.createElement('div');
    wrap.className = 'certificate-blank-lines';
    wrap.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < count; index += 1) wrap.appendChild(document.createElement('i'));
    return wrap;
  }

  function enhanceMarriageCertificate(certificate) {
    if (certificate.dataset.marriageLongPaperReady === 'true') return;

    const body = certificate.querySelector('.certificate-template__body');
    if (!body) return;

    const existingLines = Array.from(body.querySelectorAll('.certificate-line'));
    const registerLine = body.querySelector('.certificate-register-line');
    const personOne = textFrom(existingLines[0] || body, 'strong');
    const father = textFrom(existingLines[1] || body, 'strong');
    const mother = textFrom(existingLines[2] || body, 'strong');
    const marriageDate = textFrom(existingLines[4] || body, 'strong');
    const minister = textFrom(existingLines[5] || body, 'strong');
    const sponsors = textFrom(existingLines[6] || body, 'strong');
    const registerNo = textFrom(registerLine || body, 'strong:nth-of-type(1)');
    const pageNo = textFrom(registerLine || body, 'strong:nth-of-type(2)');
    const lineNo = textFrom(registerLine || body, 'strong:nth-of-type(3)');
    const issueDate = textFrom(existingLines[7] || body, 'strong');

    body.innerHTML = '';
    const intro = document.createElement('p');
    intro.textContent = 'THIS IS TO CERTIFY THAT';
    body.appendChild(intro);
    body.appendChild(splitLine([
      { label: '', value: personOne },
      { label: 'AGE', value: '' },
    ], 'certificate-line--marriage-name'));
    body.appendChild(line('CHILD OF', father || mother, 'certificate-line--marriage-wide'));
    body.appendChild(blankLines(1));

    const andLine = document.createElement('p');
    andLine.className = 'certificate-marriage-and';
    andLine.textContent = 'AND';
    body.appendChild(andLine);

    body.appendChild(splitLine([
      { label: '', value: '' },
      { label: 'AGE', value: '' },
    ], 'certificate-line--marriage-name'));
    body.appendChild(line('CHILD OF', '', 'certificate-line--marriage-wide'));
    body.appendChild(blankLines(1));

    const sacrament = document.createElement('p');
    sacrament.className = 'certificate-marriage-sacrament';
    sacrament.textContent = 'HAS SOLEMNLY RECEIVED THE SACRAMENT OF MARRIAGE ACCORDING TO THE RITES OF THE ROMAN CATHOLIC CHURCH';
    body.appendChild(sacrament);

    body.appendChild(line('ON THE', marriageDate, 'certificate-line--marriage-wide'));
    body.appendChild(line('BY THE', minister, 'certificate-line--marriage-wide'));
    body.appendChild(line('THE SPONSORS BEING', sponsors, 'certificate-line--marriage-wide'));
    body.appendChild(line('AND', '', 'certificate-line--marriage-wide'));

    const reg = document.createElement('div');
    reg.className = 'certificate-register-line certificate-register-line--marriage';
    [
      ['AS RECORDED IN THE BAPTISMAL REGISTER NO.', registerNo],
      ['PAGE', pageNo],
      ['LINE', lineNo],
      ['DATE OF ISSUE', issueDate],
    ].forEach(([labelText, valueText]) => {
      const label = document.createElement('span');
      label.textContent = labelText;
      reg.appendChild(label);
      const value = document.createElement('strong');
      value.textContent = valueText || '';
      reg.appendChild(value);
    });
    body.appendChild(reg);

    certificate.dataset.marriageLongPaperReady = 'true';
  }

  function markCertificates() {
    document.querySelectorAll('.certificate-template').forEach(certificate => {
      const title = certificate.querySelector('.certificate-template__title h3')?.textContent || '';
      const type = /marriage/i.test(title) ? 'marriage' : /baptism/i.test(title) ? 'baptism' : 'other';
      if (certificate.dataset.certificateType !== type) certificate.dataset.certificateType = type;
      if (type === 'marriage') enhanceMarriageCertificate(certificate);
    });
  }
  new MutationObserver(markCertificates).observe(document.getElementById('root'), { childList:true, subtree:true });
  markCertificates();
})();
