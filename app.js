/* app.js — London Nights event tracker */

const DATA_URL = 'data/events.json';

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── State ────────────────────────────────────────────────────────────────────
let allEvents = [];
let djNameToSlug = new Map();
let filters = { dj: '', venue: '', from: '', to: '' };
let sort = { key: 'date', dir: 'asc' };

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const tableBody       = document.getElementById('tableBody');
const mobileCards     = document.getElementById('mobileCards');
const filterVenue     = document.getElementById('filterVenue');
const searchDJ        = document.getElementById('searchDJ');
const dateFrom        = document.getElementById('dateFrom');
const dateTo          = document.getElementById('dateTo');
const clearBtn        = document.getElementById('clearFilters');
const clearBtnEmpty   = document.getElementById('clearFiltersEmpty');
const emptyState      = document.getElementById('emptyState');
const resultsMeta     = document.getElementById('resultsMeta');
const thisWeekendBtn  = document.getElementById('thisWeekend');
const nextWeekendBtn  = document.getElementById('nextWeekend');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const jsDate = new Date(y, m - 1, d);
  return {
    dayName: DAYS[jsDate.getDay()],
    display: `${d} ${MONTHS[m - 1]}`,
    isWeekend: jsDate.getDay() === 0 || jsDate.getDay() === 5 || jsDate.getDay() === 6,
  };
}

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Return {from, to} ISO date strings for a weekend.
 *  weeksAhead=0 → current/upcoming weekend; 1 → the one after. */
function getWeekendRange(weeksAhead) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay();

  let daysToFri;
  if (day === 0)      daysToFri = -2;
  else if (day === 6) daysToFri = -1;
  else                daysToFri = 5 - day;

  const fri = new Date(today);
  fri.setDate(today.getDate() + daysToFri + weeksAhead * 7);

  const sun = new Date(fri);
  sun.setDate(fri.getDate() + 2);

  return { from: toIsoDate(fri), to: toIsoDate(sun) };
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Allow only http/https URLs in href attributes — blocks javascript:, data:, etc. */
function safeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? url : '';
  } catch {
    return '';
  }
}

/** Deduplicate a lineup array:
 *  1. Case-insensitive exact match — keep first occurrence
 *  2. Prefix match — if "Samm" and "Samm (BE)" both appear, drop the shorter one */
function dedupeLineup(lineup) {
  // Pass 1: case-insensitive exact dedup
  const step1 = lineup.filter((dj, i) =>
    lineup.findIndex(d => d.toLowerCase() === dj.toLowerCase()) === i
  );
  // Pass 2: drop any name that is a prefix of a longer name in the list
  return step1.filter(dj => {
    const lower = dj.toLowerCase();
    return !step1.some(other => {
      const o = other.toLowerCase();
      return o !== lower && o.startsWith(lower);
    });
  });
}

function dedupEvents(events) {
  const map = new Map();
  for (const ev of events) {
    const key = `${ev.date}|${ev.venue.toLowerCase().trim()}`;
    if (map.has(key)) {
      const existing = map.get(key);
      for (const dj of (ev.otherDJs || [])) {
        if (!existing.otherDJs.some(d => d.toLowerCase() === dj.toLowerCase())) existing.otherDJs.push(dj);
      }
    } else {
      map.set(key, { ...ev, otherDJs: [...(ev.otherDJs || [])] });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Sort ─────────────────────────────────────────────────────────────────────
function sortEvents(events) {
  const { key, dir } = sort;
  const mul = dir === 'asc' ? 1 : -1;
  return [...events].sort((a, b) => {
    let av, bv;
    if (key === 'date')  { av = a.date; bv = b.date; }
    else if (key === 'event') { av = a.eventTitle.toLowerCase(); bv = b.eventTitle.toLowerCase(); }
    else if (key === 'venue') { av = a.venue.toLowerCase(); bv = b.venue.toLowerCase(); }
    else return 0;
    return av < bv ? -mul : av > bv ? mul : 0;
  });
}

function updateSortHeaders() {
  document.querySelectorAll('thead th[data-sort]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === sort.key) {
      th.classList.add(sort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

// ─── Render ───────────────────────────────────────────────────────────────────
function makePill(name) {
  const slug = djNameToSlug.get(name.toLowerCase());
  const label = escHtml(name);
  if (slug) {
    return `<a class="dj-pill" href="dj.html?slug=${encodeURIComponent(slug)}">${label}</a>`;
  }
  return `<span class="dj-pill" data-dj="${label}">${label}</span>`;
}

function renderTable(events) {
  const tableWrapper = document.querySelector('.table-wrapper');

  if (events.length === 0) {
    tableWrapper.hidden = true;
    if (mobileCards) mobileCards.innerHTML = '';
    emptyState.hidden = false;
    resultsMeta.textContent = '';
    return;
  }

  tableWrapper.hidden = false;
  emptyState.hidden = true;

  const total = allEvents.length;
  resultsMeta.textContent = events.length === total
    ? `${total} event${total !== 1 ? 's' : ''}`
    : `${events.length} of ${total} events`;

  const sorted = sortEvents(events);

  tableBody.innerHTML = sorted.map(ev => {
    const { dayName, display, isWeekend } = formatDate(ev.date);
    const lineup = (ev.otherDJs && ev.otherDJs.length > 0) ? ev.otherDJs : [ev.djName];
    const uniqueLineup = dedupeLineup(lineup);
    const pillsHtml = uniqueLineup.map(makePill).join('');

    const eventHtml = ev.ticketUrl
      ? `<a class="ticket-link" href="${escHtml(safeUrl(ev.ticketUrl))}" target="_blank" rel="noopener noreferrer">View event →</a>`
      : `<span class="no-tickets">—</span>`;

    return `
      <tr${isWeekend ? ' class="is-weekend"' : ''}>
        <td>
          <div class="date-cell">
            <span class="date-day">${escHtml(dayName)}</span>
            <span class="date-full">${escHtml(display)}</span>
          </div>
        </td>
        <td><span class="event-title">${escHtml(ev.eventTitle)}</span></td>
        <td><span class="venue-name">${escHtml(ev.venue)}</span></td>
        <td><div class="lineup">${pillsHtml}</div></td>
        <td>${eventHtml}</td>
      </tr>`;
  }).join('');

  // Mobile cards
  if (mobileCards) {
    mobileCards.innerHTML = sorted.map(ev => {
      const { dayName, display, isWeekend } = formatDate(ev.date);
      const lineup = (ev.otherDJs && ev.otherDJs.length > 0) ? ev.otherDJs : [ev.djName];
      const uniqueLineup = dedupeLineup(lineup);
      const pillsHtml = uniqueLineup.map(makePill).join('');

      const footerHtml = ev.ticketUrl
        ? `<div class="event-card-footer"><a class="ticket-link" href="${escHtml(safeUrl(ev.ticketUrl))}" target="_blank" rel="noopener noreferrer">View event →</a></div>`
        : '';

      return `
        <div class="event-card">
          <div class="event-card-date${isWeekend ? ' is-weekend' : ''}">${escHtml(dayName)} · ${escHtml(display)}</div>
          <div class="event-card-title">${escHtml(ev.eventTitle)}</div>
          <div class="event-card-venue">${escHtml(ev.venue)}</div>
          <div class="event-card-lineup">${pillsHtml}</div>
          ${footerHtml}
        </div>`;
    }).join('');
  }

  // Unlinked pills → filter on click
  document.querySelectorAll('span.dj-pill[data-dj]').forEach(pill => {
    pill.addEventListener('click', () => {
      searchDJ.value = pill.dataset.dj;
      filters.dj = pill.dataset.dj.toLowerCase();
      applyFilters();
    });
  });

  // Entrance animations for newly injected rows/cards
  if (typeof window.animateFeedItems === 'function') {
    window.animateFeedItems();
  }
}

// ─── Filter logic ─────────────────────────────────────────────────────────────
function updateFilterBadge() {
  const count = [filters.dj, filters.venue, filters.from, filters.to].filter(Boolean).length;
  const el = document.querySelector('.filter-count');
  if (el) el.textContent = count > 0 ? ` (${count})` : '';
}

function applyFilters() {
  const { dj, venue, from, to } = filters;
  const filtered = allEvents.filter(ev => {
    if (dj && !ev.otherDJs.some(d => d.toLowerCase().includes(dj))) return false;
    if (venue && ev.venue.toLowerCase() !== venue.toLowerCase()) return false;
    if (from && ev.date < from) return false;
    if (to   && ev.date > to)   return false;
    return true;
  });
  updateFilterBadge();
  renderTable(filtered);
}

function setWeekendFilter(weeksAhead, btn) {
  const { from, to } = getWeekendRange(weeksAhead);
  dateFrom.value = from;
  dateTo.value   = to;
  filters.from   = from;
  filters.to     = to;
  [thisWeekendBtn, nextWeekendBtn].forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}

function clearAllFilters() {
  filters = { dj: '', venue: '', from: '', to: '' };
  searchDJ.value    = '';
  filterVenue.value = '';
  dateFrom.value    = '';
  dateTo.value      = '';
  [thisWeekendBtn, nextWeekendBtn].forEach(b => b.classList.remove('active'));
  applyFilters();
}

// ─── Venue dropdown ───────────────────────────────────────────────────────────
function populateVenueDropdown(events) {
  const venues = [...new Set(events.map(ev => ev.venue))].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  venues.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    filterVenue.appendChild(opt);
  });
}

// ─── Event listeners ──────────────────────────────────────────────────────────
searchDJ.addEventListener('input', () => {
  filters.dj = searchDJ.value.toLowerCase().trim();
  applyFilters();
});

filterVenue.addEventListener('change', () => {
  filters.venue = filterVenue.value;
  applyFilters();
});

dateFrom.addEventListener('change', () => {
  filters.from = dateFrom.value;
  [thisWeekendBtn, nextWeekendBtn].forEach(b => b.classList.remove('active'));
  applyFilters();
});

dateTo.addEventListener('change', () => {
  filters.to = dateTo.value;
  [thisWeekendBtn, nextWeekendBtn].forEach(b => b.classList.remove('active'));
  applyFilters();
});

clearBtn.addEventListener('click', clearAllFilters);
clearBtnEmpty.addEventListener('click', clearAllFilters);

// Filter toggle (mobile)
const filterToggle = document.getElementById('filterToggle');
if (filterToggle) {
  filterToggle.addEventListener('click', () => {
    const panel = document.getElementById('filtersPanel');
    const open = panel.classList.toggle('is-open');
    filterToggle.setAttribute('aria-expanded', open);
  });
}
thisWeekendBtn.addEventListener('click', () => setWeekendFilter(0, thisWeekendBtn));
nextWeekendBtn.addEventListener('click', () => setWeekendFilter(1, nextWeekendBtn));

// Sort header clicks
document.querySelectorAll('thead th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (sort.key === key) {
      sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      sort.key = key;
      sort.dir = 'asc';
    }
    updateSortHeaders();
    applyFilters();
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────────
async function loadData() {
  if (window.LONDON_NIGHTS_DATA) return window.LONDON_NIGHTS_DATA;
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function init() {
  try {
    const data = await loadData();

    for (const dj of (data.djs || [])) {
      djNameToSlug.set(dj.name.toLowerCase(), dj.slug);
      if (dj.artistName) djNameToSlug.set(dj.artistName.toLowerCase(), dj.slug);
    }

    const today = toIsoDate(new Date());
    allEvents = dedupEvents(data.events || []).filter(ev => ev.date >= today);
    populateVenueDropdown(allEvents);

    // Hero event count
    const heroCount = document.getElementById('heroEventCount');
    if (heroCount) heroCount.textContent = allEvents.length;

    // Hero DJ count
    const heroDjCount = document.getElementById('heroDjCount');
    if (heroDjCount) heroDjCount.textContent = (data.djs || []).length;

    // Last updated
    const heroUpdated = document.getElementById('heroUpdated');
    if (heroUpdated && data.lastUpdated) {
      const d = new Date(data.lastUpdated);
      heroUpdated.textContent = ` · Updated ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    }

    // Set initial sort indicator
    updateSortHeaders();

    renderTable(allEvents);
  } catch (err) {
    tableBody.innerHTML = `<tr class="loading-row"><td colspan="5">
      Could not load events. Serve via <code>python3 -m http.server 8000</code>.
    </td></tr>`;
    console.error('Failed to load events.json:', err);
  }
}

init();
