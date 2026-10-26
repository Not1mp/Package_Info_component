import { Component, useEffect, useMemo, useRef, useState } from 'react';
import './NewComponent.css';
import { addWeeklyCounts, fetchPackageInfo, getSearchContext, searchNpmPackages } from './packageData';

const MAX_COMPARE = 3;

// Series colours are CSS variables, so charts follow the light/dark theme.
const seriesColor = (index) => 'var(--pi-series-' + ((index % 3) + 1) + ')';

const INTRO_TEXT = {
  details: 'The details that help you evaluate a dependency, gathered from the npm registry.',
  compare: 'Packages side by side: current metadata, release activity and install activity.',
  alternatives: 'Related packages found from npm keywords. Check their metadata before swapping a dependency.',
  recommendations: 'A focused set of npm search results for your use case, with registry details for a quick first pass.'
};

/* ---------- Small helpers ---------- */

const unique = (list) => Array.from(new Set(list));

function formatNumber(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat().format(value) : 'Not available';
}

function formatDate(value) {
  if (!value) return 'Date not listed';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date not listed';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Not listed';
  if (bytes < 1024) return Math.round(bytes) + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function modeHeading(mode, count, query) {
  if (mode === 'compare') return 'Compare packages';
  if (mode === 'alternatives') return 'Find a close alternative';
  if (mode === 'recommendations') return 'A shortlist for your use case';
  if (count) return 'A quick read on ' + (count === 1 ? 'a package' : 'your packages');
  return query ? 'Package search' : 'Npm package intelligence';
}

// Finds the package(s) with the highest or lowest value. Needs at least two packages with data.
function leaders(packages, getValue, pick) {
  const usable = packages
    .map((item) => ({ name: item.name, value: getValue(item) }))
    .filter((entry) => Number.isFinite(entry.value));
  if (usable.length < 2) return null;
  const best = pick(...usable.map((entry) => entry.value));
  return { value: best, names: usable.filter((entry) => entry.value === best).map((entry) => entry.name) };
}

/* ---------- Data loading (no UI) ---------- */

async function loadPackages(names, signal) {
  const results = await Promise.allSettled(names.map((name) => fetchPackageInfo(name, signal)));
  const loaded = [];
  const failures = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') loaded.push(result.value);
    else failures.push(names[index] + ': ' + (result.reason?.message || 'Could not load package data.'));
  });
  return { loaded, failures };
}

async function loadAlternatives(source, signal) {
  const keywordQuery = source.keywords.slice(0, 5).join(',');
  const fallbackTerms = [source.name, ...source.keywords.slice(0, 3)].join(' ');
  let found = keywordQuery ? await searchNpmPackages('keywords:' + keywordQuery, signal, 12) : [];
  if (!found.length && !signal.aborted) found = await searchNpmPackages(fallbackTerms, signal, 12);

  const sourceKeywords = new Set(source.keywords.map((keyword) => keyword.toLowerCase()));
  const others = found
    .filter((item) => item.name.toLowerCase() !== source.name.toLowerCase())
    .slice(0, 5)
    .map((item) => ({ ...item, sharedKeywords: item.keywords.filter((keyword) => sourceKeywords.has(keyword.toLowerCase())) }));
  return addWeeklyCounts(others, signal);
}

/* ---------- Small UI pieces ---------- */

function LoadingState({ mode }) {
  return (
    <div className="pi-loading" role="status" aria-live="polite">
      <span className="pi-loader" />
      <div>
        <strong>{mode === 'recommendations' ? 'Searching npm' : 'Reading npm package data'}</strong>
        <span>Fetching current registry and download information.</span>
      </div>
    </div>
  );
}

function PackagePill({ children, tone }) {
  return <span className={'pi-pill' + (tone ? ' pi-pill--' + tone : '')}>{children}</span>;
}

function PanelHeading({ title, meta }) {
  return (
    <div className="pi-panel-head">
      <h2>{title}</h2>
      {meta && <span>{meta}</span>}
    </div>
  );
}

/* ---------- Downloads chart ---------- */

function DownloadsChart({ packages }) {
  const usable = packages.filter((item) => item.dailyDownloads && item.dailyDownloads.length > 1);
  if (!usable.length) {
    return <div className="pi-empty">Daily download history is not available for this query.</div>;
  }

  const width = 720;
  const height = 178;
  const padX = 18;
  const padY = 20;
  const max = Math.max(1, ...usable.flatMap((item) => item.dailyDownloads.map((point) => point.downloads)));
  const gridLines = [0.25, 0.5, 0.75].map((ratio) => padY + (height - padY * 2) * ratio);

  function toPoints(daily) {
    return daily.map((point, index) => {
      const x = padX + ((width - padX * 2) * index) / Math.max(1, daily.length - 1);
      const y = height - padY - ((height - padY * 2) * point.downloads) / max;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
  }

  return (
    <div>
      <svg className="pi-chart" viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label="Daily npm downloads over the last month">
        {gridLines.map((y) => <line key={y} x1={padX} x2={width - padX} y1={y} y2={y} className="pi-chart-grid" />)}
        {usable.map((item, index) => (
          <polyline key={item.name} points={toPoints(item.dailyDownloads)} fill="none" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: seriesColor(index) }} />
        ))}
      </svg>
      <div className="pi-chart-axis"><span>30 days ago</span><span>Today</span></div>
      <div className="pi-chart-legend">
        {usable.map((item, index) => <span key={item.name}><i style={{ background: seriesColor(index) }} />{item.name}</span>)}
      </div>
      <p className="pi-chart-note">
        Scale: 0 to {formatNumber(max)} downloads per day.{usable.length > 1 ? ' A package with far fewer downloads will look flat; see the table for exact numbers.' : ''}
      </p>
    </div>
  );
}

function DownloadsPanel({ title, packages }) {
  return (
    <section className="pi-panel">
      <PanelHeading title={title} meta="Last 30 days" />
      <DownloadsChart packages={packages} />
    </section>
  );
}

/* ---------- Compare view ---------- */

const COMPARE_ROWS = [
  ['About', (item) => <span className="pi-clamp">{item.description}</span>],
  ['Latest version', (item) => (item.version ? 'v' + item.version : 'Not listed')],
  ['Weekly downloads', (item) => formatNumber(item.weeklyDownloads)],
  ['Last release', (item) => formatDate(item.publishedAt)],
  ['License', (item) => item.license || 'Not listed'],
  ['TypeScript types', (item) => (item.hasTypes ? 'Listed' : 'Not listed')],
  ['ES modules', (item) => (item.hasEsm ? 'Listed' : 'Not listed')],
  ['Node.js requirement', (item) => item.nodeRequirement || 'Not listed'],
  ['Unpacked size', (item) => formatSize(item.unpackedSize)]
];

function CompareTable({ packages, onAlternatives }) {
  return (
    <section className="pi-panel">
      <PanelHeading title="Side by side" meta="Latest published versions" />
      <div className="pi-table-wrap">
        <table className="pi-table" style={{ minWidth: 130 + packages.length * 150 }}>
          <thead>
            <tr>
              <th scope="col"><span className="pi-sr-only">Fact</span></th>
              {packages.map((item, index) => (
                <th scope="col" key={item.name} style={{ '--pi-col': seriesColor(index) }}>
                  <a href={item.npmUrl} target="_blank" rel="noreferrer">{item.name}</a>
                  {item.deprecated && <PackagePill tone="warning">Deprecated</PackagePill>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map(([label, getValue]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {packages.map((item) => <td key={item.name}>{getValue(item)}</td>)}
              </tr>
            ))}
            <tr>
              <th scope="row">Next step</th>
              {packages.map((item) => (
                <td key={item.name}><button className="pi-link-button" type="button" onClick={() => onAlternatives(item.name)}>See alternatives</button></td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ComparisonTakeaways({ packages }) {
  const downloads = leaders(packages, (item) => item.weeklyDownloads, Math.max);
  const newest = leaders(packages, (item) => (item.publishedAt ? new Date(item.publishedAt).getTime() : NaN), Math.max);
  const smallest = leaders(packages, (item) => (item.unpackedSize >= 0 ? item.unpackedSize : NaN), Math.min);

  const lines = [
    downloads && ['Highest weekly downloads', downloads.names.join(', ') + ' (' + formatNumber(downloads.value) + ')'],
    newest && ['Most recent release', newest.names.join(', ') + ' (' + formatDate(newest.value) + ')'],
    smallest && ['Smallest unpacked size', smallest.names.join(', ') + ' (' + formatSize(smallest.value) + ')']
  ].filter(Boolean);
  if (!lines.length) return null;

  return (
    <section className="pi-panel" aria-label="Comparison takeaways">
      <PanelHeading title="What the data shows" />
      <ul className="pi-takeaways">
        {lines.map(([label, value]) => <li key={label}><span>{label}</span><strong>{value}</strong></li>)}
      </ul>
      <p className="pi-note-text">These are observations from npm metadata, not an overall score. Downloads measure install activity, not quality.</p>
    </section>
  );
}

function AddPackageControl({ open, onToggle, value, onChange, onSubmit }) {
  return (
    <div className="pi-add">
      <button className="pi-button pi-button--secondary" type="button" onClick={onToggle} aria-expanded={open}>
        {open ? 'Close' : 'Add a package to compare'}
      </button>
      {open && (
        <form className="pi-add-form" onSubmit={onSubmit}>
          <label htmlFor="pi-compare-package">Npm package name</label>
          <div>
            <input id="pi-compare-package" value={value} onChange={onChange} placeholder="e.g. fastify or @scope/package" autoComplete="off" />
            <button className="pi-button pi-button--primary" type="submit">Compare</button>
          </div>
          <small>Up to three packages. Data loads from npm after you add a name.</small>
        </form>
      )}
    </div>
  );
}

/* ---------- Single package view ---------- */

function PackageDetails({ item, onAlternatives, onCompareWith }) {
  const facts = [
    ['Latest release', formatDate(item.publishedAt)],
    ['License', item.license || 'Not listed'],
    ['TypeScript', item.hasTypes ? 'Types listed' : 'No types listed'],
    ['ES modules', item.hasEsm ? 'Supported in metadata' : 'Not listed in metadata'],
    ['Node.js', item.nodeRequirement || 'No engine range listed'],
    ['Unpacked size', formatSize(item.unpackedSize)]
  ];

  return (
    <>
      <section className="pi-panel pi-overview">
        <div className="pi-overview__main">
          <div className="pi-title-row">
            <h2>{item.name}</h2>
            <PackagePill tone="accent">v{item.version}</PackagePill>
            {item.deprecated && <PackagePill tone="warning">Deprecated</PackagePill>}
          </div>
          <p className="pi-description">{item.description}</p>
          {item.deprecated && <div className="pi-deprecated-note">npm marks this package as deprecated: {item.deprecated}</div>}
          <div className="pi-links">
            <a href={item.npmUrl} target="_blank" rel="noreferrer">Open on npm</a>
            {item.repositoryUrl && <a href={item.repositoryUrl} target="_blank" rel="noreferrer">Source repository</a>}
            {item.homepage && <a href={item.homepage} target="_blank" rel="noreferrer">Project site</a>}
          </div>
        </div>
        <div className="pi-overview__stat">
          <span>Downloads last week</span>
          <strong>{formatNumber(item.weeklyDownloads)}</strong>
          <small>From the npm download-counts API</small>
        </div>
      </section>

      <section className="pi-facts" aria-label="Package compatibility and release facts">
        {facts.map(([label, value]) => <div className="pi-fact" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>

      <DownloadsPanel title="Recent downloads" packages={[item]} />

      <div className="pi-actions">
        <button className="pi-button pi-button--primary" type="button" onClick={() => onCompareWith('')}>Compare with another package</button>
        <button className="pi-button pi-button--secondary" type="button" onClick={() => onAlternatives(item.name)}>See alternatives</button>
      </div>
    </>
  );
}

/* ---------- Alternatives and use-case suggestions ---------- */

function SuggestionCard({ item, index, mode, onDetails, onCompareWith }) {
  const keywords = item.sharedKeywords || item.keywords || [];
  return (
    <article className="pi-suggestion" style={{ '--pi-col': seriesColor(index) }}>
      <div className="pi-suggestion__top">
        <div>
          <a href={item.npmUrl} target="_blank" rel="noreferrer">{item.name}</a>
          <span>v{item.version || 'unknown'}</span>
        </div>
        <span className="pi-rank">npm result {index + 1}</span>
      </div>
      <p>{item.description}</p>
      <div className="pi-suggestion__meta">
        <span><b>{formatNumber(item.weeklyDownloads)}</b> weekly downloads</span>
        {keywords.length > 0 && <span>{mode === 'alternatives' ? 'Shared keywords: ' : 'Keywords: '}{keywords.slice(0, 3).join(', ')}</span>}
      </div>
      <div className="pi-suggestion__actions">
        <button className="pi-link-button" type="button" onClick={() => onDetails(item.name)}>Open package details</button>
        {mode === 'alternatives' && <button className="pi-link-button" type="button" onClick={() => onCompareWith(item.name)}>Compare with source</button>}
      </div>
    </article>
  );
}

function Suggestions({ mode, sourceName, useCase, suggestions, onDetails, onCompareWith }) {
  return (
    <section className="pi-suggestions">
      {mode === 'alternatives' && sourceName && (
        <p className="pi-source"><span>Alternatives for</span><strong>{sourceName}</strong><small>Keyword matches from npm search</small></p>
      )}
      {mode === 'recommendations' && (
        <p className="pi-source"><span>Use case</span><strong>{useCase}</strong><small>Sorted by npm search results. Confirm project fit before installing.</small></p>
      )}
      {suggestions.length > 0 ? (
        <div className="pi-suggestion-list">
          {suggestions.map((item, index) => <SuggestionCard key={item.name} item={item} index={index} mode={mode} onDetails={onDetails} onCompareWith={onCompareWith} />)}
        </div>
      ) : (
        <div className="pi-empty">No related packages came back from npm search. Try a broader use case or another source package.</div>
      )}
    </section>
  );
}

/* ---------- Main component ---------- */

function NpmPackageInfo(props = {}) {
  const context = useMemo(
    () => getSearchContext(props),
    [props.searchData, props.queryProps, props.searchQuery, props.query]
  );

  // UI state: what the person has chosen through follow-up buttons
  const [modeOverride, setModeOverride] = useState(null);
  const [manualPackages, setManualPackages] = useState(null);
  const [alternativeTarget, setAlternativeTarget] = useState('');
  const [compareInput, setCompareInput] = useState('');
  const [compareOpen, setCompareOpen] = useState(false);
  const [actionNote, setActionNote] = useState('');

  // Loaded data
  const [packages, setPackages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [partialErrors, setPartialErrors] = useState([]);
  const loadedNotified = useRef(false);

  const mode = modeOverride || context.intent;
  const sourceKey = context.rawQuery + '|' + context.packageNames.join('|');

  const baseNames = useMemo(() => (
    mode === 'alternatives'
      ? [alternativeTarget || context.packageNames[0]].filter(Boolean)
      : (manualPackages || context.packageNames)
  ), [mode, alternativeTarget, context.packageNames, manualPackages]);
  const packageNames = useMemo(() => unique(baseNames).slice(0, MAX_COMPARE), [baseNames]);
  const packageNamesKey = packageNames.join('|');

  // A new search from the host resets every follow-up choice.
  useEffect(() => {
    setModeOverride(null);
    setManualPackages(null);
    setAlternativeTarget('');
    setCompareInput('');
    setCompareOpen(false);
    setActionNote('');
  }, [sourceKey]);

  // Load npm data whenever the mode or the packages change.
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    setLoading(true);
    setError('');
    setPartialErrors([]);
    setPackages([]);
    setSuggestions([]);

    async function loadData() {
      if (mode === 'recommendations') {
        const query = context.discoveryQuery || context.rawQuery || 'popular npm packages';
        try {
          const found = await searchNpmPackages(query, signal, 6);
          const enriched = await addWeeklyCounts(found, signal);
          if (!signal.aborted) setSuggestions(enriched);
        } catch (loadError) {
          if (!signal.aborted) setError(loadError.message || 'Could not search the npm registry.');
        } finally {
          if (!signal.aborted) setLoading(false);
        }
        return;
      }

      if (!packageNames.length) {
        setError('No npm package name came through with this query. Try a package name such as express or react.');
        setLoading(false);
        return;
      }

      const { loaded, failures } = await loadPackages(packageNames, signal);
      if (signal.aborted) return;
      setPackages(loaded);
      setPartialErrors(failures);

      if (!loaded.length) {
        setError(failures.join(' '));
        setLoading(false);
        return;
      }

      if (mode === 'alternatives') {
        try {
          const found = await loadAlternatives(loaded[0], signal);
          if (!signal.aborted) setSuggestions(found);
        } catch (loadError) {
          if (!signal.aborted) setError('Package details loaded, but npm search could not find alternatives: ' + (loadError.message || 'service unavailable'));
        }
      }
      if (!signal.aborted) setLoading(false);
    }

    loadData().catch((loadError) => {
      if (!signal.aborted) {
        setError(loadError.message || 'Could not load npm data. Please try the search again.');
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [mode, packageNamesKey, context.discoveryQuery, context.rawQuery]);

  // Tell the host once the component has finished loading.
  useEffect(() => {
    const notify = props.messageHandlers?.componentLoaded;
    if (!loading && !loadedNotified.current && typeof notify === 'function') {
      notify();
      loadedNotified.current = true;
    }
  }, [loading, props]);

  /* Follow-up actions: no new host search needed */

  function beginAlternatives(name) {
    setAlternativeTarget(name);
    setModeOverride('alternatives');
    setActionNote('');
  }

  function beginDetails(name) {
    setManualPackages([name]);
    setModeOverride('details');
    setAlternativeTarget('');
    setActionNote('');
  }

  function beginCompareWith(name) {
    const next = unique([...baseNames, name].filter(Boolean));
    if (name && next.length > MAX_COMPARE) {
      setActionNote('A comparison can show up to three packages.');
      return;
    }
    setManualPackages(next.slice(0, MAX_COMPARE));
    setModeOverride('compare');
    setAlternativeTarget('');
    setCompareOpen(!name);
    setActionNote('');
  }

  function submitCompare(event) {
    event.preventDefault();
    const candidate = compareInput.trim();
    if (!candidate) return;
    beginCompareWith(candidate);
    setCompareInput('');
  }

  /* What to show */

  const isSidebar = props.format === 'sidebar';
  const themeMode = props.theme && (props.theme.mode || props.theme.palette?.mode);
  const themeClass = themeMode === 'dark' ? ' pi--dark' : themeMode === 'light' ? ' pi--light' : '';
  const sourcePackage = packages[0];
  const isCompare = mode === 'compare' && packages.length > 1;
  const isSuggestionMode = mode === 'alternatives' || mode === 'recommendations';
  const showSingleView = !error && !isCompare && !isSuggestionMode && !!sourcePackage;
  const canAddPackage = mode === 'compare' && packages.length > 0 && packageNames.length < MAX_COMPARE;

  return (
    <main className={'pi' + (isSidebar ? ' pi--sidebar' : '') + themeClass}>
      <header className="pi-header">
        <h1>{modeHeading(mode, packageNames.length, context.rawQuery)}</h1>
        <p>{INTRO_TEXT[mode] || INTRO_TEXT.details}</p>
        {context.rawQuery && <div className="pi-query"><span>Search</span>{context.rawQuery}</div>}
      </header>

      {loading && <LoadingState mode={mode} />}
      {!loading && error && <div className="pi-alert" role="status"><strong>Could not finish this lookup.</strong><span>{error}</span></div>}
      {!loading && partialErrors.length > 0 && packages.length > 0 && <div className="pi-alert pi-alert--soft" role="status"><strong>Some package data is missing.</strong><span>{partialErrors.join(' ')}</span></div>}
      {!loading && actionNote && <div className="pi-action-note" role="status">{actionNote}</div>}

      {!loading && showSingleView && <PackageDetails item={sourcePackage} onAlternatives={beginAlternatives} onCompareWith={beginCompareWith} />}

      {!loading && mode === 'compare' && packages.length === 1 && !error && (
        <div className="pi-alert pi-alert--soft"><strong>Add one more package</strong><span>Search results supplied one package. Use the comparison control to add another package.</span></div>
      )}

      {!loading && isCompare && <CompareTable packages={packages} onAlternatives={beginAlternatives} />}

      {!loading && canAddPackage && (
        <AddPackageControl
          open={compareOpen}
          onToggle={() => setCompareOpen((open) => !open)}
          value={compareInput}
          onChange={(event) => setCompareInput(event.target.value)}
          onSubmit={submitCompare}
        />
      )}

      {!loading && isCompare && (
        <>
          <ComparisonTakeaways packages={packages} />
          <DownloadsPanel title="Daily downloads" packages={packages} />
        </>
      )}

      {!loading && !error && isSuggestionMode && (
        <Suggestions
          mode={mode}
          sourceName={sourcePackage?.name}
          useCase={context.discoveryQuery || context.rawQuery}
          suggestions={suggestions}
          onDetails={beginDetails}
          onCompareWith={beginCompareWith}
        />
      )}

      <footer className="pi-footer">
        <span>Data: npm registry and npm download counts</span>
        <span>Metadata can lag or be incomplete.</span>
      </footer>
    </main>
  );
}

/* ---------- Error boundary ---------- */

class NpmPackageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Package Info hit an unexpected rendering error.', error);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="pi pi-error" role="alert">
          <h1>Package Info could not load this view.</h1>
          <p>Refresh the page or try another package search.</p>
        </main>
      );
    }
    return this.props.children;
  }
}

export default function NewComponent(props = {}) {
  return (
    <NpmPackageErrorBoundary>
      <NpmPackageInfo {...props} />
    </NpmPackageErrorBoundary>
  );
}