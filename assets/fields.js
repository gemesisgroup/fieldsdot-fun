(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const SITE = window.SITE || {};
  const CHAIN = (SITE.chains || {})[SITE.network || 'mainnet'] || { chainId: 99901, name: 'Elysium', rpc: 'https://rpc.elysium.kinetiq.xyz', explorer: 'https://elysium.kinetiq.xyz/explorer' };
  const EVM = /^0x[0-9a-fA-F]{40}$/;
  const TICKER = `$${SITE.ticker || 'FIELDS'}`;
  const ROUND_FALLBACK = 900;
  const exAddr = (a) => `${CHAIN.explorer}/address/${a}`;
  const exTx = (h) => `${CHAIN.explorer}/tx/${h}`;
  let data = null;
  let prevData = null;

  /* ---------------- format ---------------- */
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const compact = (n) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(Number(n) || 0);

  const hype = (n) => {
    const v = Number(n) || 0;
    if (v === 0) return '0';
    if (v < 0.001) return '<0.001';
    if (v >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    if (v >= 100) return v.toFixed(1).replace(/\.0$/, '');
    return v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  };

  const ago = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  };

  const held = (m) => (m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d`);

  const mult = (m) => {
    const v = Math.max(1, Math.min(5, Number(m) || 1));
    const segs = Array.from({ length: 5 }, (_, i) => `<i class="${v >= i + 1 ? 'on' : ''}"></i>`).join('');
    return `<span class="mult">${segs}<b>${v % 1 ? v.toFixed(1) : v}x</b></span>`;
  };

  /* ---------------- animated number ticker ---------------- */
  // без анимации: число должно быть верным в любой момент, даже если вкладка в фоне
  function animateValue(el, target, prefix = '', suffix = '') {
    el.textContent = prefix + hype(target) + suffix;
  }

  /* ---------------- toast ---------------- */
  const toast = $('#toast');
  let toastTimer;
  function notify(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  /* ---------------- brand / header ---------------- */
  function setupBrand() {
    document.querySelectorAll('[data-ticker]').forEach((el) => { el.textContent = TICKER; });
    document.querySelectorAll('[data-chain]').forEach((el) => { el.textContent = CHAIN.name.toUpperCase(); });
    const ca = SITE.contract || '';
    $('#ca-short').textContent = ca ? short(ca) : 'TBA';
    $('#ca-short').addEventListener('click', async () => {
      if (!ca) { notify(`${TICKER} contract address goes live at launch.`); return; }
      try { await navigator.clipboard.writeText(ca); notify(`Copied ${TICKER} contract ${short(ca)}`); }
      catch { notify(ca); }
    });
    const buy = $('#buy-link'), x = $('#x-link'), buyHero = $('#buy-hero');
    // buyUrl can be a template with {ca}: https://pump.fun/coin/{ca}
    const tpl = SITE.buyUrl || '';
    const needsCa = tpl.includes('{ca}');
    const buyHref = tpl.split('{ca}').join(ca);
    if (buyHref && (!needsCa || ca)) {
      buy.href = buyHref; buy.hidden = false;
      if (buyHero) { buyHero.href = buyHref; buyHero.hidden = false; }
    }
    if (SITE.xUrl) { x.href = SITE.xUrl; x.hidden = false; }
    if (ca) $('#explorer-link').href = exAddr(ca);
  }

  /* ---------------- add network ---------------- */
  function setupNetwork() {
    $('#add-network').addEventListener('click', async () => {
      const eth = window.ethereum;
      if (!eth?.request) { notify('No EVM wallet found. Install MetaMask, Rabby or similar.'); return; }
      try {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x' + CHAIN.chainId.toString(16),
            chainName: CHAIN.name,
            nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
            rpcUrls: [CHAIN.rpc],
            blockExplorerUrls: [CHAIN.explorer],
          }],
        });
        notify(`${CHAIN.name} added to your wallet.`);
      } catch (e) {
        notify(e?.code === 4001 ? 'Cancelled in wallet.' : 'Wallet refused to add the network.');
      }
    });
  }

  /* ---------------- clock ---------------- */
  const blocks = [];
  function setupClock() {
    const bar = $('#progress-blocks');
    for (let i = 0; i < 20; i++) { const s = document.createElement('span'); bar.appendChild(s); blocks.push(s); }
    tick();
    setInterval(tick, 1000);
  }
  function tick() {
    const roundMs = (data?.roundSeconds || ROUND_FALLBACK) * 1000;
    let rem = roundMs;
    if (data?.live && data.nextPayoutAt) {
      rem = data.nextPayoutAt - Date.now();
      if (rem < 0) rem = 0;
    }
    const s = Math.ceil(rem / 1000);
    $('#timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const done = Math.floor(((roundMs - rem) / roundMs) * 20);
    blocks.forEach((b, i) => b.classList.toggle('filled', i < done));
    if (data?.live && data.updatedAt) $('#updated').textContent = `UPDATED ${ago(Date.now() - data.updatedAt).toUpperCase()}`;
  }

  /* ---------------- data ---------------- */
  async function load() {
    try {
      const res = await fetch(`data/state.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      prevData = data;
      data = await res.json();
      render();
    } catch (e) {
      console.error('state.json', e);
    }
  }

  function render() {
    const live = !!data.live;
    $('#round-indicator').textContent = live ? `◼ ROUND #${(data.round || 0) + 1}` : '◼ STARTS AT LAUNCH';
    
    // Animate stat values
    const potEl = $('#pot');
    if (prevData?.potHype !== undefined) {
      animateValue(potEl, data.potHype);
    } else {
      potEl.textContent = hype(data.potHype);
    }
    
    const forfeitEl = $('#forfeit');
    if (prevData?.forfeitHype !== undefined) {
      animateValue(forfeitEl, data.forfeitHype);
    } else {
      forfeitEl.textContent = hype(data.forfeitHype);
    }
    
    const paidEl = $('#paid');
    // «Paid to holders» = РЅР°С‡РёСЃР»РµРЅРѕ Р·Р° РІСЃРµ СЂР°СѓРЅРґС‹ (СЂР°СЃС‚С‘С‚ РЅР° РєР°Р¶РґРѕРј Р·Р°РєСЂС‹С‚РёРё),
    // РІ РїРѕРґРїРёСЃРё РєР°СЂС‚РѕС‡РєРё — СЃРєРѕР»СЊРєРѕ РёР· СЌС‚РѕРіРѕ СѓР¶Рµ РїРµСЂРµРІРµРґРµРЅРѕ РґРµРЅСЊРіР°РјРё.
    const allocated = data.allocatedHype ?? data.totalPaidHype ?? 0;
    const transferred = data.transferredHype ?? data.totalPaidHype ?? 0;
    if (prevData && (prevData.allocatedHype !== undefined || prevData.totalPaidHype !== undefined)) {
      animateValue(paidEl, allocated);
    } else {
      paidEl.textContent = hype(allocated);
    }
    const paidFoot = paidEl.closest('.stat-card')?.querySelector('.stat-foot');
    if (paidFoot) paidFoot.textContent = `ALLOCATED BY ROUNDS · ${hype(transferred)} TRANSFERRED`;
    
    $('#eligible').textContent = Number(data.eligible || 0).toLocaleString('en-US');
    if (data.rewards) {
      $('#pool-link').href = exAddr(data.rewards);
      $('#pool-balance').textContent = `${hype(data.rewardsHype)} HYPE`;
    }
    $('#data-stamp').textContent = live ? `◼ ON-CHAIN / UPDATED ${ago(Date.now() - data.updatedAt).toUpperCase()}` : '◻ ON-CHAIN / ELYSIUM';
    renderExpected();
    renderStrip();
    renderBoard($('#holder-search').value);
    renderFeed();
    tick();
  }

  /* Projection, not a payout: what the next round would distribute if it closed now.
     The number comes from the indexer (weights x pot); nothing is actually sent. */
  function renderExpected() {
    const grid = document.querySelector('.stats-grid');
    if (!grid) return;
    let el = document.getElementById('expected-line');
    if (!el) {
      el = document.createElement('p');
      el.id = 'expected-line';
      el.className = 'mono';
      el.style.cssText = 'grid-column:1/-1;margin:14px 0 0;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#5d6b62';
      grid.after(el);
    }
    const wallets = Number(data?.expectedRecipients || 0);
    const hypeTotal = Number(data?.expectedPayoutHype || 0);
    el.textContent = wallets > 0
      ? `IF CLOSED NOW · ${hype(hypeTotal)} HYPE → ${wallets.toLocaleString('en-US')} WALLETS`
      : 'IF CLOSED NOW · NOTHING TO PAY YET';
  }


  /* live strip: real numbers instead of a repeated slogan */
  let stripSig = '';
  function renderStrip() {
    const track = document.getElementById('ticker-track');
    if (!track) return;
    const parts = [];
    const last = (data?.feed || []).find((f) => f.kind === 'payout');
    if (last) parts.push(`Last harvest ${hype(last.hype)} HYPE to ${Number(last.recipients || 0)} wallets`);
    parts.push(`${Number(data?.eligible || 0)} holders counted`);
    if (data?.live && data.nextPayoutAt) {
      const mins = Math.max(0, Math.ceil((data.nextPayoutAt - Date.now()) / 60000));
      parts.push(mins > 0 ? `Next harvest in ${mins} min` : 'Harvest is due');
    } else {
      parts.push('First harvest 15 minutes after launch');
    }
    parts.push(`Pot ${hype(data?.potHype)} HYPE`);
    parts.push('Built on Elysium');
    const sig = parts.join('|');
    if (sig === stripSig) return;
    stripSig = sig;
    const html = parts.map((p) => `<span>${esc(p)}</span><i></i>`).join('');
    track.innerHTML = html + html; // duplicated for a seamless loop
  }

  function renderBoard(q = '') {
    const rows = $('#board-rows');
    const all = (data?.holders || []).map((h, i) => ({ h, rank: i + 1 }));
    const query = q.trim().toLowerCase();
    const list = (query ? all.filter(({ h }) => h.wallet.toLowerCase().includes(query)) : all).slice(0, 200);
    const empty = $('#empty-state');
    if (!list.length) {
      rows.innerHTML = '';
      empty.hidden = false;
      empty.style.display = '';
      if (query && all.length) {
        $('#empty-title').textContent = 'NO MATCH';
        $('#empty-message').textContent = 'No wallet on the board matches that. Try a shorter search.';
        $('#empty-badge').hidden = true;
      } else {
        $('#empty-title').textContent = 'NO HOLDERS YET';
        $('#empty-message').textContent = data?.live ? 'Wallets with enough $FIELDS appear here after their first full round.' : 'The board fills in after the first harvest round.';
        $('#empty-badge').hidden = false;
      }
    } else {
      empty.style.display = 'none';
      rows.innerHTML = list.map(({ h, rank }) => `<div class="row">
        <span class="mono">${rank}</span>
        <span><button type="button" class="w" data-wallet="${esc(h.wallet)}" title="${esc(h.wallet)}">${short(h.wallet)}</button></span>
        <span class="mono">${compact(h.balance)}</span>
        <span>${mult(h.multiplier)}</span>
        <span class="mono">${(Number(h.weightPct) || 0).toFixed(2)}%</span>
      </div>`).join('');
    }
    $('#showing').textContent = `SHOWING ${list.length} OF ${Math.min(200, all.length) || 200}`;
  }

  function renderFeed() {
    const feed = data?.feed || [];
    const ul = $('#feed');
    if (!feed.length) {
      ul.innerHTML = `<li class="feed-empty">${data?.live ? 'No payouts yet. The first round is paid when its 15 minutes are up.' : 'No payouts yet. The first round is paid 15 minutes after launch.'}</li>`;
      return;
    }
    ul.innerHTML = feed.map((e) => {
      const link = e.tx ? `<a href="${exTx(esc(e.tx))}" target="_blank" rel="noopener">EXPLORER ↗</a>` : (e.sim ? '<span class="mono">TEST</span>' : '<span></span>');
      const when = `<time>${ago(Date.now() - e.ts)}</time>`;
      const paidWord = e.sim ? 'would be paid' : 'paid';
      if (e.kind === 'forfeit') {
        return `<li class="forfeit"><span class="dot"></span><span><b class="mono">${short(e.wallet)}</b> sold during round #${esc(e.round)}. ${hype(e.hype)} HYPE ${e.sim ? 'would go' : 'went'} to the holders who stayed.</span>${link}${when}</li>`;
      }
      return `<li><span class="dot"></span><span>Round #${esc(e.round)}: <b>${hype(e.hype)} HYPE</b> ${paidWord} to ${Number(e.recipients || 0)} holders${e.forfeitIn > 0 ? `, incl. ${hype(e.forfeitIn)} HYPE forfeited` : ''}.</span>${link}${when}</li>`;
    }).join('');
  }

  /* ---------------- wallet lookup ---------------- */
  function lookup(addr) {
    const fb = $('#wallet-feedback');
    const card = $('#wallet-card');
    fb.className = 'form-feedback';
    card.hidden = true;
    if (!EVM.test(addr)) {
      fb.textContent = '↳ That is not a valid wallet. Expected 0x + 40 hex characters.';
      fb.classList.add('error');
      return;
    }
    try { localStorage.setItem('fields-wallet', addr); } catch { /* ignore */ }
    const holders = data?.holders || [];
    const idx = holders.findIndex((h) => h.wallet.toLowerCase() === addr.toLowerCase());
    if (idx < 0) {
      const min = Number(data?.minHold || SITE.minHold || 0).toLocaleString('en-US');
      fb.textContent = `↳ ${short(addr)} isn't on the board yet. Hold ${min} ${TICKER} or more and it shows up after its first full round, starting at 1x.`;
      return;
    }
    const h = holders[idx];
    const next = h.multiplier >= 5 ? 'MAXED' : held(Math.max(0, ([10, 60, 120, 180, 240].find((t) => t > h.heldMin) || 240) - h.heldMin));
    fb.textContent = `↳ ${short(addr)} · rank #${idx + 1}`;
    fb.classList.add('success');
    card.innerHTML = `
      <div><span>Bag</span><b>${compact(h.balance)}</b></div>
      <div><span>Multiplier</span><b>${h.multiplier % 1 ? h.multiplier.toFixed(1) : h.multiplier}x</b></div>
      <div><span>Next step in</span><b>${next}</b></div>
      <div><span>Held for</span><b>${held(h.heldMin)}</b></div>
      <div><span>Share</span><b>${(Number(h.weightPct) || 0).toFixed(2)}%</b></div>
      <div><span>Paid so far</span><b>${hype(h.paidHype || 0)} HYPE</b></div>`;
    card.hidden = false;
  }

  function setupLookup() {
    const field = $('#wallet-address');
    $('#wallet-form').addEventListener('submit', (ev) => { ev.preventDefault(); lookup(field.value.trim()); });
    $('#board-rows').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-wallet]');
      if (!b) return;
      field.value = b.dataset.wallet;
      $('#wallet').scrollIntoView({ behavior: 'smooth', block: 'start' });
      lookup(b.dataset.wallet);
    });
    $('#holder-search').addEventListener('input', (ev) => renderBoard(ev.target.value));
  }

  function restoreWallet() {
    try {
      const last = localStorage.getItem('fields-wallet');
      if (last && EVM.test(last)) { $('#wallet-address').value = last; lookup(last); }
    } catch { /* ignore */ }
  }

  /* ---------------- mobile nav ---------------- */
  function setupNav() {
    const menu = $('#mobile-menu'), nav = $('#main-nav');
    menu.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') === 'true';
      menu.setAttribute('aria-expanded', String(!open));
      menu.textContent = open ? 'MENU +' : 'CLOSE ×';
      nav.classList.toggle('open', !open);
    });
    nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
      nav.querySelectorAll('x').forEach((x) => x.classList.remove('active'));
      a.classList.add('active');
      nav.classList.remove('open');
      menu.setAttribute('aria-expanded', 'false');
      menu.textContent = 'MENU +';
    }));
  }

  setupBrand();
  setupNetwork();
  setupClock();
  setupLookup();
  setupNav();
  load().then(restoreWallet);
  setInterval(load, 5000); // Faster polling for pyramid effect
})();
