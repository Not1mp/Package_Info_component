import { Component, useEffect, useMemo, useRef, useState } from 'react';
import './NewComponent.css';
import { addWeeklyCounts, fetchPackageInfo, getSearchContext, searchNpmPackages } from './packageData';

const SERIES_COLORS = ['#e05a38', '#327c77', '#7456bb'];

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

function PackageCard({ item, index, onAlternatives, onCompareWith, compact, allowAddCompare }) {
  const color = SERIES_COLORS[index % SERIES_COLORS.length];
  return (
    <article className={'pi-package-card' + (compact ? ' pi-package-card--compact' : '')} style={{ '--pi-series': color }}>
      <div className="pi-package-card__top">
        <div className="pi-package-avatar" aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</div>
        <div className="pi-package-name-wrap">
          <a className="pi-package-name" href={item.npmUrl} target="_blank" rel="noreferrer">{item.name}</a>
          <span className="pi-package-version">v{item.version || 'unknown'}</span>
        </div>
        {item.deprecated && <PackagePill tone="warning">Deprecated</PackagePill>}
      </div>
      <p className="pi-package-description">{item.description}</p>
      <div className="pi-card-metrics">
        <div>
          <span className="pi-metric-label">Weekly downloads</span>
          <strong>{formatNumber(item.weeklyDownloads)}</strong>
        </div>
        <div>
          <span className="pi-metric-label">Latest release</span>
          <strong>{formatDate(item.publishedAt)}</strong>
        </div>
      </div>
      <div className="pi-package-tags">
        <PackagePill tone={item.hasTypes ? 'good' : 'neutral'}>{item.hasTypes ? 'TypeScript types' : 'No types listed'}</PackagePill>
        <PackagePill tone={item.hasEsm ? 'good' : 'neutral'}>{item.hasEsm ? 'ESM' : 'ESM not listed'}</PackagePill>
        {item.license && <PackagePill>{item.license}</PackagePill>}
      </div>
      <div className="pi-card-actions">
        <button type="button" onClick={() => onAlternatives(item.name)}>See alternatives <span aria-hidden="true">↗</span></button>
        {allowAddCompare && <button type="button" onClick={() => onCompareWith()}>Add another package</button>}
      </div>
    </article>
  );
}

function DownloadsChart({ packages }) {
  const usable = packages.filter((item) => item.dailyDownloads && item.dailyDownloads.length > 1);
  if (!usable.length) {
    return <div className="pi-chart-empty">Daily download history is not available for this query.</div>;
  }
  const width = 720;
  const height = 178;
  const padX = 18;
  const padY = 20;
  const values = usable.flatMap((item) => item.dailyDownloads.map((point) => point.downloads));
  const max = Math.max(1, ...values);
  const lines = [0.25, 0.5, 0.75].map((ratio) => padY + (height - padY * 2) * ratio);

  return (
    <div className="pi-chart-frame">
      <svg className="pi-chart" viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label="Daily npm downloads over the last month">
        {lines.map((y) => <line key={y} x1={padX} x2={width - padX} y1={y} y2={y} className="pi-chart-grid" />)}
        {usable.map((item, packageIndex) => {
          const points = item.dailyDownloads.map((point, pointIndex) => {
            const x = padX + ((width - padX * 2) * pointIndex) / Math.max(1, item.dailyDownloads.length - 1);
            const y = height - padY - ((height - padY * 2) * point.downloads) / max;
            return x.toFixed(1) + ',' + y.toFixed(1);
          }).join(' ');
          return <polyline key={item.name} points={points} fill="none" stroke={SERIES_COLORS[packageIndex % SERIES_COLORS.length]} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />;
        })}
      </svg>
      <div className="pi-chart-axis"><span>30 days ago</span><span>Daily downloads</span><span>Today</span></div>
      <div className="pi-chart-legend">
        {usable.map((item, index) => <span key={item.name}><i style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} />{item.name}</span>)}
      </div>
    </div>
  );
}

function ComparisonTable({ packages }) {
  const rows = [
    ['Latest version', (item) => 'v' + item.version],
    ['Weekly downloads', (item) => formatNumber(item.weeklyDownloads)],
    ['Last release', (item) => formatDate(item.publishedAt)],
    ['License', (item) => item.license || 'Not listed'],
    ['TypeScript types', (item) => item.hasTypes ? 'Listed' : 'Not listed'],
    ['ES modules', (item) => item.hasEsm ? 'Listed' : 'Not listed'],
    ['Node.js requirement', (item) => item.nodeRequirement || 'Not listed'],
    ['Unpacked size', (item) => formatSize(item.unpackedSize)]
  ];
  return (
    <div className="pi-table-wrap">
      <table className="pi-compare-table">
        <thead><tr><th scope="col">Package facts</th>{packages.map((item, index) => <th scope="col" key={item.name}><span className="pi-table-dot" style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} />{item.name}</th>)}</tr></thead>
        <tbody>{rows.map(([label, getter]) => <tr key={label}><th scope="row">{label}</th>{packages.map((item) => <td key={item.name}>{getter(item)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function ComparisonHighlights({ packages }) {
  const highlights = [];
  const withDownloads = packages.filter((item) => Number.isFinite(item.weeklyDownloads));
  if (withDownloads.length > 1) {
    const highest = Math.max(...withDownloads.map((item) => item.weeklyDownloads));
    const names = withDownloads.filter((item) => item.weeklyDownloads === highest).map((item) => item.name);
    highlights.push({ label: 'Highest weekly download count', value: names.join(', ') + ' · ' + formatNumber(highest) });
  }

  const withReleaseDates = packages
    .map((item) => ({ ...item, releaseDate: new Date(item.publishedAt) }))
    .filter((item) => !Number.isNaN(item.releaseDate.getTime()));
  if (withReleaseDates.length > 1) {
    const latest = Math.max(...withReleaseDates.map((item) => item.releaseDate.getTime()));
    const names = withReleaseDates.filter((item) => item.releaseDate.getTime() === latest).map((item) => item.name);
    highlights.push({ label: 'Most recent release', value: names.join(', ') + ' · ' + formatDate(latest) });
  }

  const withSizes = packages.filter((item) => Number.isFinite(item.unpackedSize) && item.unpackedSize >= 0);
  if (withSizes.length > 1) {
    const smallest = Math.min(...withSizes.map((item) => item.unpackedSize));
    const names = withSizes.filter((item) => item.unpackedSize === smallest).map((item) => item.name);
    highlights.push({ label: 'Smallest unpacked size', value: names.join(', ') + ' · ' + formatSize(smallest) });
  }

  if (!highlights.length) return null;
  return (
    <section className="pi-panel pi-highlights" aria-label="Comparison highlights">
      <div className="pi-section-heading"><div><div className="pi-eyebrow">FACTUAL SNAPSHOT</div><h2>What the current data shows</h2></div></div>
      <div className="pi-highlights-grid">
        {highlights.map((item) => <div className="pi-highlight" key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}
      </div>
      <p className="pi-highlights-note">These are observations from available npm metadata, not an overall package score. Downloads measure install activity, not quality.</p>
    </section>
  );
}

function SuggestionCard({ item, index, mode, onDetails, onCompareWith }) {
  const keywords = item.sharedKeywords || item.keywords;
  return (
    <article className="pi-suggestion" style={{ '--pi-series': SERIES_COLORS[index % SERIES_COLORS.length] }}>
      <div className="pi-suggestion__heading">
        <div><a href={item.npmUrl} target="_blank" rel="noreferrer">{item.name}</a><span>v{item.version || 'unknown'}</span></div>
        <span className="pi-search-rank">npm result {index + 1}</span>
      </div>
      <p>{item.description}</p>
      <div className="pi-suggestion__meta">
        <span><b>{formatNumber(item.weeklyDownloads)}</b> weekly downloads</span>
        {!!keywords.length && <span className="pi-keywords">{mode === 'alternatives' ? 'shared: ' : ''}{keywords.slice(0, 3).join(' · ')}</span>}
      </div>
      <div className="pi-card-actions">
        <button type="button" onClick={() => onDetails(item.name)}>Open package details</button>
        {mode === 'alternatives' && <button type="button" onClick={() => onCompareWith(item.name)}>Compare with source</button>}
      </div>
    </article>
  );
}

function PackageOverview({ item, onAlternatives, onCompareWith }) {
  return (
    <>
      <section className="pi-overview pi-panel">
        <div className="pi-overview__main">
          <div className="pi-eyebrow">PACKAGE OVERVIEW <span>·</span> LATEST PUBLISHED VERSION</div>
          <div className="pi-overview__title-row">
            <h2>{item.name}</h2>
            <PackagePill tone="accent">v{item.version}</PackagePill>
            {item.deprecated && <PackagePill tone="warning">Deprecated</PackagePill>}
          </div>
          <p className="pi-overview__description">{item.description}</p>
          {item.deprecated && <div className="pi-deprecated-note">npm marks this package as deprecated: {item.deprecated}</div>}
          <div className="pi-overview__links">
            <a href={item.npmUrl} target="_blank" rel="noreferrer">Open on npm <span aria-hidden="true">↗</span></a>
            {item.repositoryUrl && <a href={item.repositoryUrl} target="_blank" rel="noreferrer">Source repository <span aria-hidden="true">↗</span></a>}
            {item.homepage && <a href={item.homepage} target="_blank" rel="noreferrer">Project site <span aria-hidden="true">↗</span></a>}
          </div>
        </div>
        <div className="pi-overview__stat">
          <span className="pi-metric-label">Downloads last week</span>
          <strong>{formatNumber(item.weeklyDownloads)}</strong>
          <small>npm download-counts API</small>
        </div>
      </section>
      <section className="pi-facts-grid" aria-label="Package compatibility and release facts">
        <div className="pi-fact"><span>Latest release</span><strong>{formatDate(item.publishedAt)}</strong></div>
        <div className="pi-fact"><span>License</span><strong>{item.license || 'Not listed'}</strong></div>
        <div className="pi-fact"><span>TypeScript</span><strong>{item.hasTypes ? 'Types listed' : 'No types listed'}</strong></div>
        <div className="pi-fact"><span>ES modules</span><strong>{item.hasEsm ? 'Supported in metadata' : 'Not listed in metadata'}</strong></div>
        <div className="pi-fact"><span>Node.js</span><strong>{item.nodeRequirement || 'No engine range listed'}</strong></div>
        <div className="pi-fact"><span>Unpacked size</span><strong>{formatSize(item.unpackedSize)}</strong></div>
      </section>
      <div className="pi-followups">
        <button className="pi-button pi-button--primary" type="button" onClick={() => onCompareWith('')}>Compare with another package <span aria-hidden="true">+</span></button>
        <button className="pi-button pi-button--secondary" type="button" onClick={() => onAlternatives(item.name)}>See alternatives <span aria-hidden="true">↗</span></button>
      </div>
    </>
  );
}

function NpmPackageInfo(props = {}) {
  const context = useMemo(
    () => getSearchContext(props),
    [props.searchData, props.queryProps, props.searchQuery, props.query]
  );
  const [modeOverride, setModeOverride] = useState(null);
  const [manualPackages, setManualPackages] = useState(null);
  const [alternativeTarget, setAlternativeTarget] = useState('');
  const [compareInput, setCompareInput] = useState('');
  const [compareOpen, setCompareOpen] = useState(false);
  const [actionNote, setActionNote] = useState('');
  const [packages, setPackages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [partialErrors, setPartialErrors] = useState([]);
  const loadedNotified = useRef(false);
  const mode = modeOverride || context.intent;
  const sourceKey = context.rawQuery + '|' + context.packageNames.join('|');
  const packageNames = useMemo(() => {
    const names = mode === 'alternatives'
      ? [alternativeTarget || context.packageNames[0]].filter(Boolean)
      : (manualPackages || context.packageNames);
    return Array.from(new Set(names)).slice(0, 3);
  }, [mode, alternativeTarget, context.packageNames, manualPackages]);
  const packageNamesKey = packageNames.join('|');

  useEffect(() => {
    setModeOverride(null);
    setManualPackages(null);
    setAlternativeTarget('');
    setCompareInput('');
    setCompareOpen(false);
    setActionNote('');
  }, [sourceKey]);

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

      const results = await Promise.allSettled(packageNames.map((name) => fetchPackageInfo(name, signal)));
      if (signal.aborted) return;
      const loaded = [];
      const failures = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') loaded.push(result.value);
        else failures.push(packageNames[index] + ': ' + (result.reason && result.reason.message || 'Could not load package data.'));
      });
      setPackages(loaded);
      setPartialErrors(failures);

      if (!loaded.length) {
        setError(failures.join(' '));
        setLoading(false);
        return;
      }

      if (mode === 'alternatives') {
        const source = loaded[0];
        const keywordQuery = source.keywords.slice(0, 5).join(',');
        const fallbackTerms = [source.name].concat(source.keywords.slice(0, 3)).join(' ');
        try {
          let found = keywordQuery
            ? await searchNpmPackages('keywords:' + keywordQuery, signal, 12)
            : [];
          if (!found.length && !signal.aborted) found = await searchNpmPackages(fallbackTerms, signal, 12);
          const filtered = found.filter((item) => item.name.toLowerCase() !== source.name.toLowerCase()).slice(0, 5);
          const sourceKeywords = new Set(source.keywords.map((keyword) => keyword.toLowerCase()));
          const withSharedKeywords = filtered.map((item) => ({ ...item, sharedKeywords: item.keywords.filter((keyword) => sourceKeywords.has(keyword.toLowerCase())) }));
          const enriched = await addWeeklyCounts(withSharedKeywords, signal);
          if (!signal.aborted) setSuggestions(enriched);
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

  useEffect(() => {
    const notify = props && props.messageHandlers && props.messageHandlers.componentLoaded;
    if (!loading && !loadedNotified.current && typeof notify === 'function') {
      notify();
      loadedNotified.current = true;
    }
  }, [loading, props]);

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
    const base = mode === 'alternatives'
      ? [alternativeTarget || context.packageNames[0]].filter(Boolean)
      : (manualPackages || context.packageNames);
    const next = Array.from(new Set([...base, name].filter(Boolean)));
    if (name && next.length > 3) {
      setActionNote('A comparison can show up to three packages.');
      return;
    }
    setManualPackages(next.slice(0, 3));
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

  const heading = modeHeading(mode, packageNames.length, context.rawQuery);
  const isSidebar = props && props.format === 'sidebar';
  const isCompare = mode === 'compare' && packages.length > 1;
  const sourcePackage = packages[0];
  const themeMode = props && props.theme && (props.theme.mode || (props.theme.palette && props.theme.palette.mode));
  const themeClass = themeMode === 'dark' ? ' pi--dark' : themeMode === 'light' ? ' pi--light' : '';

  return (
    <main className={'pi' + (isSidebar ? ' pi--sidebar' : '') + themeClass}>
      <header className="pi-masthead">
        <div className="pi-brand"><span className="pi-brand-mark">npm</span><span className="pi-brand-name">DEP SIGNAL<small>PACKAGE INTELLIGENCE</small></span></div>
        <span className="pi-live"><i /> Live npm data</span>
      </header>

      <section className="pi-intro">
        <div className="pi-eyebrow">DEVELOPER TOOLKIT <span>·</span> NPM ECOSYSTEM</div>
        <h1>{heading}</h1>
        <p>{mode === 'compare'
          ? 'A side-by-side view of current package metadata, release activity and install activity.'
          : mode === 'alternatives'
            ? 'Related packages are found from npm keywords. Check their metadata before swapping a dependency.'
            : mode === 'recommendations'
              ? 'A focused set of npm search results for your use case, with registry details for a quick first pass.'
              : 'The details that help you evaluate a dependency, gathered from the npm registry.'}</p>
        {context.rawQuery && <div className="pi-query-chip"><span>SEARCH</span>{context.rawQuery}</div>}
      </section>

      {loading && <LoadingState mode={mode} />}
      {!loading && error && <div className="pi-alert" role="status"><strong>Could not finish this lookup.</strong><span>{error}</span></div>}
      {!loading && partialErrors.length > 0 && packages.length > 0 && <div className="pi-alert pi-alert--soft" role="status"><strong>Some package data is missing.</strong><span>{partialErrors.join(' ')}</span></div>}
      {!loading && actionNote && <div className="pi-action-note" role="status">{actionNote}</div>}

      {!loading && isCompare && (
        <>
          <section className="pi-compare-summary pi-panel">
            <div><div className="pi-eyebrow">AT A GLANCE</div><h2>{packages.length} packages, one factual view</h2><p>Downloads describe install activity. They do not measure package quality or suitability.</p></div>
            <div className="pi-compare-count"><strong>{packages.length}</strong><span>packages</span></div>
          </section>
          <section className="pi-package-grid" aria-label="Compared packages">
            {packages.map((item, index) => <PackageCard key={item.name} item={item} index={index} compact={isSidebar} allowAddCompare={packageNames.length < 3} onAlternatives={beginAlternatives} onCompareWith={beginCompareWith} />)}
          </section>
          <ComparisonHighlights packages={packages} />
          <section className="pi-panel pi-chart-panel">
            <div className="pi-section-heading"><div><div className="pi-eyebrow">INSTALL ACTIVITY</div><h2>Daily downloads</h2></div><span>Last 30 days</span></div>
            <DownloadsChart packages={packages} />
          </section>
          <section className="pi-panel pi-matrix-panel">
            <div className="pi-section-heading"><div><div className="pi-eyebrow">REGISTRY METADATA</div><h2>Package facts</h2></div><span>Latest published versions</span></div>
            <ComparisonTable packages={packages} />
          </section>
        </>
      )}

      {!loading && !error && !isCompare && mode !== 'alternatives' && mode !== 'recommendations' && sourcePackage && (
        <PackageOverview item={sourcePackage} onAlternatives={beginAlternatives} onCompareWith={beginCompareWith} />
      )}

      {!loading && mode === 'compare' && packages.length === 1 && !error && (
        <div className="pi-alert pi-alert--soft"><strong>Add one more package</strong><span>Search results supplied one package. Use the comparison control to add another package.</span></div>
      )}

      {!loading && (mode === 'alternatives' || mode === 'recommendations') && !error && (
        <section className="pi-recommendations">
          {mode === 'alternatives' && sourcePackage && (
            <div className="pi-source-strip"><span>ALTERNATIVES FOR</span><strong>{sourcePackage.name}</strong><small>Keyword matches from npm search</small></div>
          )}
          {mode === 'recommendations' && (
            <div className="pi-source-strip"><span>USE CASE</span><strong>{context.discoveryQuery || context.rawQuery}</strong><small>Sorted by npm search results; confirm project fit before installing.</small></div>
          )}
          {suggestions.length > 0 ? (
            <div className="pi-suggestion-list">{suggestions.map((item, index) => <SuggestionCard key={item.name} item={item} index={index} mode={mode} onDetails={beginDetails} onCompareWith={beginCompareWith} />)}</div>
          ) : (
            <div className="pi-chart-empty">No related packages came back from npm search. Try a broader use case or another source package.</div>
          )}
        </section>
      )}

      {!loading && mode !== 'recommendations' && mode !== 'alternatives' && packages.length > 0 && !isCompare && (
        <section className="pi-history-panel pi-panel">
          <div className="pi-section-heading"><div><div className="pi-eyebrow">INSTALL ACTIVITY</div><h2>Recent downloads</h2></div><span>Last 30 days</span></div>
          <DownloadsChart packages={packages.slice(0, 1)} />
        </section>
      )}

      {!loading && mode === 'compare' && packages.length > 0 && packageNames.length < 3 && (
        <div className="pi-compare-control">
          <button className="pi-button pi-button--secondary" type="button" onClick={() => setCompareOpen((open) => !open)} aria-expanded={compareOpen}>Add a package to compare <span aria-hidden="true">{compareOpen ? '−' : '+'}</span></button>
          {compareOpen && (
            <form className="pi-compare-form" onSubmit={submitCompare}>
              <label htmlFor="pi-compare-package">Npm package name</label>
              <div><input id="pi-compare-package" value={compareInput} onChange={(event) => setCompareInput(event.target.value)} placeholder="e.g. fastify or @scope/package" autoComplete="off" /><button className="pi-button pi-button--primary" type="submit">Compare</button></div>
              <small>Up to three packages. Data loads from npm after you add a name.</small>
            </form>
          )}
        </div>
      )}

      <footer className="pi-footer"><span>Data: npm registry + npm download counts</span><span>Metadata can lag or be incomplete.</span></footer>
    </main>
  );
}

class NpmPackageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Dep Signal hit an unexpected rendering error.', error);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="pi pi-error" role="alert">
          <h1>Dep Signal could not load this view.</h1>
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
