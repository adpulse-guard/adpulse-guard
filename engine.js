(function () {

  if (!window.APG_CONFIG) return;

  const DEFAULTS = {
    ignoreAnchorSlots: true,
    apiEndpoint: 'https://script.google.com/macros/s/AKfycbxAD4aNij0ApHx21r68hq5TLx2k2r3VT9_obEe7I-EX_l3JGDQSnrY84LcA4QG8Ldf2ig/exec',
    version: 'start-1.2.0-appscript',
    scanScheduleMs: [3500, 10000, 40000],
    dedupeTtlMs: 24 * 60 * 60 * 1000,
    domSlotSelector:
      'div[id^="div-gpt-ad"],div[id^="gpt-"],div[id^="ad-"],div[id*="ad-slot"],div[id*="gpt-ad"],div[id*="slot"]',
    revenueModel: {
      currency: 'USD',
      assumedRpm: 1,
      assumedImpressionsPerHour: 500
    }
  };


  const CONFIG = Object.assign({}, DEFAULTS, window.APG_CONFIG);

  if (!CONFIG.clientId || !CONFIG.siteToken || !CONFIG.allowedDomain) return;
  const host = location.hostname.replace(/^www\./, '');


if (
  host !== CONFIG.allowedDomain &&
  !host.endsWith('.' + CONFIG.allowedDomain)
) return;

  const pageLoadId =
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  const issueBuffer = [];
  const seenThisLoad = new Set();
  let flushTimer = null;
  let flushed = false;

  const blockedSizes = ['1x1', '2x1'];

  function isPubconsoleId(id) {
    return typeof id === 'string' && id.startsWith('google_pubconsole_overlay_');
  }
function isIgnorableDomSlot(el) {
  if (!el) return true;

  // pubconsole / overlay
  if (isPubconsoleId(el.id)) return true;

  // anchor / oop containeri često imaju fixed position
  const style = window.getComputedStyle(el);
  if (style.position === 'fixed') return true;

  // zero-size / invisible
  if (el.offsetWidth < 10 || el.offsetHeight < 10) return true;

  return false;
}

  function extractNetworkId(path) {
  if (typeof path !== 'string') return '';
  const match = path.match(/^\/(\d+)\//);
  return match ? match[1] : '';
}
     function isIgnorableSlot(slot) {
  try {
    if (!slot) return true;

    // 🔥 GLOBAL KILL SWITCH ZA ANCHOR / OOP
    if (CONFIG.ignoreAnchorSlots && slot.getOutOfPage?.()) return true;

    const id = slot.getSlotElementId?.();
    if (!id) return true;

    const el = document.getElementById(id);
    if (!el) return false; // ✅ NE ignoriši ako nema DOM još

    const style = window.getComputedStyle(el);
    if (style.position === 'fixed') return true;
    if (style.position === 'sticky') return true;

  } catch {}
  return false;
}
function isSuspectedAnchorSlot(slot) {
  try {
    const id = slot?.getSlotElementId?.();
    if (!id) return false;

    // naming pattern (footer / anchor / sticky)
    if (/anchor|sticky|oop|adhesion|footer/i.test(id)) return true;

    const el = document.getElementById(id);
    if (!el) return false;

    const style = window.getComputedStyle(el);
    if (style.position === 'fixed' || style.position === 'sticky') return true;

  } catch {}
  return false;
}

  function severityFor(type) {
  if (type === 'slot_not_registered') return 'high';
  if (['gpt_not_loaded', 'wrong_network'].includes(type)) return 'high';
  if (['empty_response', 'unexpected_size', 'defined_without_dom'].includes(type)) return 'medium';
  return 'low';
}
function isElementObstructed(slotEl, gptIds) {
  const rect = slotEl.getBoundingClientRect();

  // van viewporta → ignore
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false;

  const points = [
    [rect.left + 5, rect.top + 5],
    [rect.right - 5, rect.top + 5],
    [rect.left + 5, rect.bottom - 5],
    [rect.right - 5, rect.bottom - 5],
    [rect.left + rect.width / 2, rect.top + rect.height / 2]
  ];

  let obstructedHits = 0;

  for (const [x, y] of points) {
    const elements = document.elementsFromPoint(x, y);

    const obstructed = elements.some(el => {
      if (el === slotEl) return false;
      if (slotEl.contains(el)) return false;
      if (el.id && gptIds.includes(el.id)) return false;

      // IGNORE layout roditelje (ključno za leaderboard)
      if (el === slotEl.parentElement) return false;

      const style = window.getComputedStyle(el);
      if (style.pointerEvents === 'none') return false;
      if (style.visibility === 'hidden' || style.display === 'none') return false;

      return true;
    });

    if (obstructed) obstructedHits++;
  }

  // prag: mora bar 2 tačke da budu problem
  return obstructedHits >= 2;
}

function rectsOverlap(a, b, thresholdPx = 20) {
  const overlapX = Math.max(
    0,
    Math.min(a.right, b.right) - Math.max(a.left, b.left)
  );
  const overlapY = Math.max(
    0,
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  );
  return overlapX > thresholdPx && overlapY > thresholdPx;
}
  function estimateRevenueRisk() {
    const h =
      (CONFIG.revenueModel.assumedImpressionsPerHour / 1000) *
      CONFIG.revenueModel.assumedRpm;

    return {
      estimationCurrency: CONFIG.revenueModel.currency,
      assumedRpm: CONFIG.revenueModel.assumedRpm,
      assumedImpressionsPerHour: CONFIG.revenueModel.assumedImpressionsPerHour,
      estimatedHourlyRevenueRisk: Math.round(h * 100) / 100,
      estimatedDailyRevenueRisk: Math.round(h * 24 * 100) / 100,
      estimationMethod: 'conservative_time_based_risk',
      revenueAssumptionsNote: '500 imps/hour, $1 RPM, conservative baseline'
    };
  }
function activateLazySlotsOnce() {
  try {
    // lagani scroll da probudi lazy / BTF slotove
    window.scrollTo(0, document.body.scrollHeight * 0.8);

    // blagi GPT refresh (bez force)
    if (window.googletag && googletag.apiReady) {
      googletag.cmd.push(function () {
        googletag.pubads().refresh();
      });
    }
  } catch {}
}

  function crossPageDedupe(issue) {
    try {
      const key = [
        'apg',
        CONFIG.clientId,
        location.href,
        issue.issueType,
        issue.slotId || ''
      ].join('|');

      const prev = localStorage.getItem(key);
      if (prev && Date.now() - Number(prev) < CONFIG.dedupeTtlMs) return false;
      localStorage.setItem(key, String(Date.now()));
      return true;
    } catch {
      return true;
    }
  }

  function recordIssue(issue) {
    if (issue.slotId && isPubconsoleId(issue.slotId)) return;

    const memKey = issue.issueType + '|' + (issue.slotId || '');
    if (seenThisLoad.has(memKey)) return;
    seenThisLoad.add(memKey);

    issueBuffer.push({
      issueType: issue.issueType,
      slotId: issue.slotId || '',
      adUnitPath: issue.adUnitPath || '',
      networkId: issue.networkId || '',
      renderedSize: issue.renderedSize,
      definedSizes: issue.definedSizes,
      scanAttempt: issue.scanAttempt,
      scanDelayMs: issue.scanDelayMs,
      severity: issue.severity || severityFor(issue.issueType)
    });

    console.log('[APG] issue detected:', issue.issueType, issue.slotId);
  }
let lazyActivated = false;
  function flushIssues() {
  if (!issueBuffer.length) return;
  if (flushed) return;
  flushed = true;

  const sendable = issueBuffer.filter(crossPageDedupe);
  if (!sendable.length) return;

  const expectedSlotCount =
  document.querySelectorAll('[id^="div-gpt-ad"]').length;

  const payload = Object.assign(
    {
      clientId: CONFIG.clientId,
      siteToken: CONFIG.siteToken,
      host: location.hostname,
      pageUrl: location.href,
      expectedSlotCount: expectedSlotCount,
      timestamp: new Date().toISOString(),
      tagVersion: CONFIG.version,
      pageLoadId,
      issueType: 'multiple_issues',
      severity: sendable.some(i => i.severity === 'high')
  ? 'high'
  : sendable.some(i => i.severity === 'medium')
    ? 'medium'
    : 'info',
      issues: sendable
    },
    estimateRevenueRisk()
  );

  fetch(CONFIG.apiEndpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'text/plain;charset=UTF-8'
  },
  body: JSON.stringify(payload)
}).catch(() => {
});

}
function scheduleFlush(delay = 1500) {
  if (flushed) return;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushIssues();
  }, delay);
}

  function scan(attempt) {
    if (!window.googletag || !googletag.apiReady) {
      if (attempt === CONFIG.scanScheduleMs.length - 1) {
        recordIssue({
          issueType: 'gpt_not_loaded',
          scanAttempt: attempt + 1,
          scanDelayMs: CONFIG.scanScheduleMs[attempt]
        });
        scheduleFlush();
      }
      return;
    }

    const domIds = Array.from(document.querySelectorAll(CONFIG.domSlotSelector))
  .filter(el => !isIgnorableDomSlot(el))
  .map(el => el.id)
  .filter(Boolean);

    const allSlots = googletag.pubads().getSlots();

// 1) SVI GPT ids (uključujući OOP) — samo da DOM comparison ne laže
const gptIdsAll = allSlots
  .map(s => s.getSlotElementId?.())
  .filter(id => id && !isPubconsoleId(id));

// 2) SLOTOVI za real checkove (NON-OOP)
const slots = allSlots
  .filter(s => {
    // ovde zadržiš tvoju logiku
    if (isIgnorableSlot(s)) return false; // ovo i dalje seče OOP
    return !s.getSizes().some(size => {
      const w = size.getWidth?.();
      const h = size.getHeight?.();
      return blockedSizes.includes(`${w}x${h}`);
    });
  });

    const gptIds = slots
  .map(s => s.getSlotElementId?.())
  .filter(id => id && !isPubconsoleId(id));

    domIds.forEach(id => {
  if (!gptIdsAll.includes(id)) {
    recordIssue({
      issueType: 'slot_not_registered',
      slotId: id,
      scanAttempt: attempt + 1,
      scanDelayMs: CONFIG.scanScheduleMs[attempt]
    });
  }
});

    slots.forEach(s => {
      const slotId = s.getSlotElementId?.();
      if (!slotId || isPubconsoleId(slotId)) return;

      const path = s.getAdUnitPath?.();
      if (!path) return;

      const nid = extractNetworkId(path);
      if (!nid) return;
      if (String(CONFIG.expectedNetworkId) && nid !== String(CONFIG.expectedNetworkId)) {
        recordIssue({
          issueType: 'wrong_network',
          slotId,
          adUnitPath: path,
          networkId: nid,
          scanAttempt: attempt + 1,
          scanDelayMs: CONFIG.scanScheduleMs[attempt],
          severity: severityFor('wrong_network')
        });
      }
    });

   if (attempt === CONFIG.scanScheduleMs.length - 1) {

  // 🔔 probudi lazy / BTF slotove pre finalnog skena
  if (!lazyActivated) {
  lazyActivated = true;
  activateLazySlotsOnce();
}

setTimeout(() => {
  // 🔄 RE-CAPTURE GPT STATE
  const refreshedSlots = googletag
  .pubads()
  .getSlots()
  .filter(s => {
    if (isIgnorableSlot(s)) return false;
    return !s.getSizes().some(size => {
      const w = size.getWidth?.();
      const h = size.getHeight?.();
      return blockedSizes.includes(`${w}x${h}`);
    });
  });

  const refreshedGptIds = refreshedSlots
    .map(s => s.getSlotElementId())
    .filter(id => id && !isPubconsoleId(id));

  refreshedSlots.forEach(s => {
  if (isIgnorableSlot(s)) return;
  const slotId = s.getSlotElementId?.();
  if (!slotId || isPubconsoleId(slotId)) return;

    if (!document.getElementById(slotId)) {
      recordIssue({
        issueType: 'defined_without_dom',
        slotId,
        adUnitPath: s.getAdUnitPath?.(),
        scanAttempt: attempt + 1,
        scanDelayMs: CONFIG.scanScheduleMs[attempt]
      });
    }
  });

  refreshedGptIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const iframe = el.querySelector('iframe');
    if (!iframe) return;
    if (window.outerWidth - window.innerWidth > 200) return;

    if (isElementObstructed(el, refreshedGptIds)) {
      recordIssue({
        issueType: 'ad_visibility_impaired',
        slotId: id,
        scanAttempt: attempt + 1,
        scanDelayMs: CONFIG.scanScheduleMs[attempt]
      });
    }
  });

  const slotElements = refreshedGptIds
    .map(id => document.getElementById(id))
    .filter(el => el && el.offsetWidth > 0 && el.offsetHeight > 0)
    .map(el => ({
      id: el.id,
      rect: el.getBoundingClientRect()
    }));

  for (let i = 0; i < slotElements.length; i++) {
    for (let j = i + 1; j < slotElements.length; j++) {
      const a = slotElements[i];
      const b = slotElements[j];

      if (rectsOverlap(a.rect, b.rect)) {
        recordIssue({
          issueType: 'layout_overlap',
          slotId: `${a.id} ↔ ${b.id}`,
          scanAttempt: attempt + 1,
          scanDelayMs: CONFIG.scanScheduleMs[attempt]
        });
      }
    }
  }

  scheduleFlush();
}, 500);
  }
}

  function attachGptListeners() {
    (window.googletag = window.googletag || { cmd: [] }).cmd.push(function () {
      const pubads = googletag.pubads();
      if (pubads.__apgBound) return;
      pubads.__apgBound = true;

      pubads.addEventListener('slotRenderEnded', function (e) {
  	if (isIgnorableSlot(e.slot)) return;
  	const slotId = e.slot?.getSlotElementId?.();
  	if (!slotId || isPubconsoleId(slotId)) return;
	

        const adUnitPath = e.slot?.getAdUnitPath?.() || '';

        if (e.isEmpty) {
          recordIssue({ issueType: 'empty_response', slotId, adUnitPath });
	  scheduleFlush();
        }

        if (e.size && e.slot?.getSizes) {
          const rendered = e.size[0] + 'x' + e.size[1];
          const defined = e.slot.getSizes().map(
            s => s.getWidth() + 'x' + s.getHeight()
          );

          if (!defined.includes(rendered)) {
            recordIssue({
              issueType: 'unexpected_size',
              slotId,
              adUnitPath,
              renderedSize: rendered,
              definedSizes: defined
            });
	 scheduleFlush();
          }
        }
      });
    });
  }

  attachGptListeners();
  CONFIG.scanScheduleMs.forEach((ms, i) => setTimeout(() => scan(i), ms));
})();
