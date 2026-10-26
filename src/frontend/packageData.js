const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const REQUEST_TIMEOUT_MS = 15000;
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'about', 'best', 'by', 'compare', 'compared', 'current', 'details',
  'find', 'for', 'get', 'info', 'latest', 'library', 'libraries', 'like', 'me', 'newest',
  'npm', 'of', 'or', 'package', 'packages', 'popular', 'recommend', 'recommendation',
  'replace', 'replacement', 'show', 'similar', 'the', 'to', 'using', 'version', 'versions',
  'vs', 'versus', 'what', 'which', 'with'
]);

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function validName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/^npm:/i, '');
  return PACKAGE_NAME.test(name) ? name.toLowerCase() : null;
}

function collectEntityNames(value, names, depth) {
  if (depth > 5 || value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectEntityNames(item, names, depth + 1));
    return;
  }
  if (typeof value !== 'object') return;

  const collection = [value.collectionName, value.collectionType, value.entityType]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
  const hasPackageCollection = collection.includes('NPM_PACKAGES') || collection.includes('HD_PACKAGES');
  const hasOtherEntityType = Boolean(value.entityType) && !/PACKAGE/i.test(value.entityType);
  const candidate = validName(value.sourceID || value.packageName || value.name || value.word);
  if (candidate && (hasPackageCollection || (!hasOtherEntityType && !collection))) names.push(candidate);

  ['entities', 'searchData', 'results', 'data'].forEach((key) => {
    if (value[key]) collectEntityNames(value[key], names, depth + 1);
  });
}

function collectQueryPropNames(queryProps) {
  if (!queryProps || typeof queryProps !== 'object') return [];
  const filters = queryProps.filters && typeof queryProps.filters === 'object' ? queryProps.filters : {};
  const values = [];
  [
    queryProps.packages,
    queryProps.packageNames,
    queryProps.package,
    queryProps.packageName,
    filters.packages,
    filters.packageNames,
    filters.package,
    filters.name
  ].forEach((value) => {
    if (Array.isArray(value)) values.push(...value);
    else if (value) values.push(value);
  });
  return values.map(validName).filter(Boolean);
}

function getRawQuery(props) {
  const direct = props && (props.searchQuery || props.query);
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const data = props && props.searchData;
  const records = Array.isArray(data) ? data : [data];
  const queryRecord = records.find((item) => item && typeof item.query === 'string' && item.query.trim());
  return queryRecord ? queryRecord.query.trim() : '';
}

function looksLikeUseCase(query) {
  return /\b(best|recommend|recommendation|library|libraries|package for|packages for|tool for)\b/i.test(query);
}

function namesFromText(query) {
  if (!query || looksLikeUseCase(query)) return [];
  const tokens = query.match(/@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9][a-z0-9._-]*/gi) || [];
  return unique(tokens
    .map(validName)
    .filter((name) => name && !STOP_WORDS.has(name.toLowerCase()) && !/^\d+(?:\.\d+)*$/.test(name)));
}

export function getSearchContext(props) {
  const rawQuery = getRawQuery(props || {});
  const entityNames = [];
  collectEntityNames(props && props.searchData, entityNames, 0);
  const queryPropNames = collectQueryPropNames(props && props.queryProps);
  const packageNames = unique([...entityNames, ...queryPropNames]);
  const finalNames = packageNames.length ? packageNames : namesFromText(rawQuery);

  let intent = 'details';
  if (/\b(compare|vs\.?|versus|difference|differentiate)\b/i.test(rawQuery)) intent = 'compare';
  else if (/\b(alternatives?|similar|packages? like|replace|replacement)\b/i.test(rawQuery)) intent = 'alternatives';
  else if (!finalNames.length && looksLikeUseCase(rawQuery)) intent = 'recommendations';

  const discoveryQuery = rawQuery
    .replace(/^\s*(?:what\s+are\s+|which\s+are\s+|find\s+|show\s+me\s+|recommend\s+)?/i, '')
    .replace(/^\s*(?:the\s+)?(?:best\s+|popular\s+)?(?:npm\s+)?(?:packages?|libraries|library|tools?)\s+(?:for|to)\s+/i, '')
    .replace(/^\s*(?:npm\s+)?(?:package|library)\s+for\s+/i, '')
    .replace(/[?.!]+$/g, '')
    .trim();

  return { rawQuery, packageNames: finalNames, intent, discoveryQuery };
}

function encodeRegistryName(name) {
  if (name.startsWith('@')) {
    const parts = name.slice(1).split('/');
    return '@' + parts.map(encodeURIComponent).join('%2F');
  }
  return encodeURIComponent(name);
}

async function readJson(url, signal, headers) {
  const requestController = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, REQUEST_TIMEOUT_MS);
  const abortRequest = () => requestController.abort();

  if (signal && signal.aborted) abortRequest();
  else if (signal) signal.addEventListener('abort', abortRequest, { once: true });

  try {
    const response = await fetch(url, { signal: requestController.signal, headers: headers || {} });
    if (!response.ok) {
      const message = response.status === 404
        ? 'Package was not found in the npm registry.'
        : response.status === 429
          ? 'The npm service is receiving too many requests. Try again shortly.'
          : 'The npm service returned ' + response.status + '.';
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (timedOut) throw new Error('The npm service took too long to respond. Please try again.');
    if (signal && signal.aborted) throw error;
    if (error && error.name === 'SyntaxError') throw new Error('The npm service returned unreadable data.');
    if (error && error.status) throw error;
    throw new Error('Could not reach the npm service. Check your connection and try again.');
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', abortRequest);
  }
}

function hasImportExport(exportsField) {
  if (typeof exportsField === 'string') return /\.mjs(?:$|[?#])/i.test(exportsField);
  if (!exportsField || typeof exportsField !== 'object') return false;
  if (Array.isArray(exportsField)) return exportsField.some(hasImportExport);
  if (Object.prototype.hasOwnProperty.call(exportsField, 'import')) return true;
  return Object.values(exportsField).some(hasImportExport);
}

async function readWeeklyDownloads(name, signal) {
  try {
    const result = await readJson('https://api.npmjs.org/downloads/point/last-week/' + encodeURIComponent(name), signal);
    return Number.isFinite(result.downloads) ? result.downloads : null;
  } catch (error) {
    if (error && error.name === 'AbortError') throw error;
    return null;
  }
}

export async function fetchPackageInfo(name, signal) {
  const encodedName = encodeRegistryName(name);
  // The full package record includes the release time map used by the UI.
  const registryPromise = readJson('https://registry.npmjs.org/' + encodedName, signal);
  const weeklyPromise = readWeeklyDownloads(name, signal);
  const monthPromise = readJson(
    'https://api.npmjs.org/downloads/range/last-month/' + encodeURIComponent(name),
    signal
  ).catch((error) => {
    if (error && error.name === 'AbortError') throw error;
    return null;
  });
  const results = await Promise.all([registryPromise, weeklyPromise, monthPromise]);
  const record = results[0];
  const version = record['dist-tags'] && record['dist-tags'].latest;
  const manifest = (record.versions && record.versions[version]) || record;
  const repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository && manifest.repository.url;
  const repositoryUrl = repository
    ? repository.replace(/^git\+/, '').replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '')
    : '';
  const weeklyResult = results[1];
  const monthResult = results[2];
  const downloads = monthResult && Array.isArray(monthResult.downloads)
    ? monthResult.downloads.map((point) => ({ day: point.day, downloads: point.downloads || 0 }))
    : [];
  const nodeRequirement = manifest.engines && manifest.engines.node;

  return {
    name: manifest.name || record.name || name,
    version: manifest.version || version || 'Unknown',
    description: manifest.description || 'No description is listed for this package.',
    publishedAt: (record.time && record.time[version]) || '',
    weeklyDownloads: weeklyResult,
    dailyDownloads: downloads,
    license: (manifest.license && (manifest.license.type || manifest.license)) || '',
    nodeRequirement: nodeRequirement || '',
    hasTypes: Boolean(manifest.types || manifest.typings),
    hasEsm: Boolean(manifest.type === 'module' || manifest.module || hasImportExport(manifest.exports)),
    unpackedSize: manifest.dist && manifest.dist.unpackedSize,
    deprecated: manifest.deprecated || '',
    keywords: Array.isArray(manifest.keywords) ? manifest.keywords : [],
    homepage: manifest.homepage || '',
    repositoryUrl,
    npmUrl: 'https://www.npmjs.com/package/' + name
  };
}

export async function searchNpmPackages(query, signal, limit) {
  const url = 'https://registry.npmjs.org/-/v1/search?text=' + encodeURIComponent(query) + '&size=' + (limit || 6);
  const result = await readJson(url, signal);
  return (result.objects || []).map((entry) => {
    const item = entry.package || {};
    return {
      name: item.name || '',
      version: item.version || '',
      description: item.description || 'No description is listed for this package.',
      keywords: Array.isArray(item.keywords) ? item.keywords : [],
      npmUrl: item.links && item.links.npm || 'https://www.npmjs.com/package/' + encodeURIComponent(item.name || ''),
      weeklyDownloads: null
    };
  }).filter((item) => item.name);
}

export async function addWeeklyCounts(items, signal) {
  return Promise.all(items.map(async (item) => ({
    ...item,
    weeklyDownloads: await readWeeklyDownloads(item.name, signal)
  })));
}




