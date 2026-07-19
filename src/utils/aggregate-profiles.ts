import yaml from 'js-yaml'

export interface AggregateSource {
  /** Subscription display name, used as a prefix to keep node names unique. */
  name: string
  /** Raw YAML content of the subscription file. */
  content: string
}

export interface AggregateLabels {
  /** Name for the top-level manual selector group. */
  selectGroup: string
  /** Name for the automatic (url-test) group covering every node. */
  autoGroup: string
}

export interface AggregateResult {
  /** Serialized YAML for the merged local profile. */
  yaml: string
  /** Total number of proxy nodes collected across subscriptions. */
  nodeCount: number
  /** Number of subscriptions that contributed at least one node or provider. */
  subCount: number
}

interface ProxyNode {
  name?: unknown
  [key: string]: unknown
}

const HEALTH_CHECK_URL = 'https://www.gstatic.com/generate_204'
const HEALTH_CHECK_INTERVAL = 300
const NAME_SEPARATOR = ' | '

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Returns a name that is not already present in `used`, appending a numeric
 * suffix on collision. mihomo requires proxy/group/provider names to be unique.
 */
const makeUniqueName = (base: string, used: Set<string>): string => {
  const trimmed = base.trim() || 'unnamed'
  let name = trimmed
  let counter = 2
  while (used.has(name)) {
    name = `${trimmed} (${counter})`
    counter += 1
  }
  used.add(name)
  return name
}

/**
 * Merges the proxies (and any `proxy-providers`) of several subscriptions into a
 * single Clash/mihomo config. Node names are prefixed with their subscription
 * name to avoid collisions, one url-test group is created per subscription, plus
 * a global auto group and a manual selector that a MATCH rule points at.
 */
export function buildAggregatedConfig(
  sources: AggregateSource[],
  labels: AggregateLabels,
): AggregateResult {
  const usedNames = new Set<string>()
  const proxies: ProxyNode[] = []
  const proxyProviders: Record<string, unknown> = {}
  const subGroups: Array<{ name: string; proxies: string[]; use: string[] }> =
    []
  const allNodeNames: string[] = []

  let subCount = 0

  for (const source of sources) {
    let doc: unknown
    try {
      doc = yaml.load(source.content)
    } catch {
      continue
    }
    if (!isRecord(doc)) continue

    const subLabel = source.name?.trim() || 'Subscription'
    const rawProxies = Array.isArray(doc.proxies)
      ? (doc.proxies as ProxyNode[])
      : []
    const rawProviders = isRecord(doc['proxy-providers'])
      ? (doc['proxy-providers'] as Record<string, unknown>)
      : {}

    const subNodeNames: string[] = []
    const subUse: string[] = []

    for (const node of rawProxies) {
      if (!isRecord(node) || typeof node.name !== 'string') continue
      const newName = makeUniqueName(
        `${subLabel}${NAME_SEPARATOR}${node.name}`,
        usedNames,
      )
      proxies.push({ ...node, name: newName })
      subNodeNames.push(newName)
      allNodeNames.push(newName)
    }

    for (const [key, value] of Object.entries(rawProviders)) {
      if (!isRecord(value)) continue
      const newKey = makeUniqueName(
        `${subLabel}${NAME_SEPARATOR}${key}`,
        usedNames,
      )
      const provider = { ...value }
      // Drop the on-disk cache path so the core derives a unique one from the
      // (now unique) provider name; otherwise duplicated paths could clash.
      delete provider.path
      proxyProviders[newKey] = provider
      subUse.push(newKey)
    }

    if (subNodeNames.length === 0 && subUse.length === 0) continue

    const groupName = makeUniqueName(subLabel, usedNames)
    subGroups.push({ name: groupName, proxies: subNodeNames, use: subUse })
    subCount += 1
  }

  const autoName = makeUniqueName(labels.autoGroup, usedNames)
  const selectName = makeUniqueName(labels.selectGroup, usedNames)

  const proxyGroups: Record<string, unknown>[] = []

  proxyGroups.push({
    name: selectName,
    type: 'select',
    proxies: [autoName, ...subGroups.map((group) => group.name), 'DIRECT'],
  })

  const autoGroup: Record<string, unknown> = {
    name: autoName,
    type: 'url-test',
    url: HEALTH_CHECK_URL,
    interval: HEALTH_CHECK_INTERVAL,
  }
  if (allNodeNames.length) autoGroup.proxies = allNodeNames
  const allUse = Array.from(new Set(subGroups.flatMap((group) => group.use)))
  if (allUse.length) autoGroup.use = allUse
  proxyGroups.push(autoGroup)

  for (const group of subGroups) {
    const entry: Record<string, unknown> = {
      name: group.name,
      type: 'url-test',
      url: HEALTH_CHECK_URL,
      interval: HEALTH_CHECK_INTERVAL,
    }
    if (group.proxies.length) entry.proxies = group.proxies
    if (group.use.length) entry.use = group.use
    proxyGroups.push(entry)
  }

  const config: Record<string, unknown> = {
    proxies,
    'proxy-groups': proxyGroups,
    rules: [`MATCH,${selectName}`],
  }
  if (Object.keys(proxyProviders).length) {
    config['proxy-providers'] = proxyProviders
  }

  const header = '# Generated by Clash Verge - Aggregated subscriptions\n\n'
  const body = yaml.dump(config, { lineWidth: -1, noRefs: true })

  return { yaml: header + body, nodeCount: allNodeNames.length, subCount }
}
