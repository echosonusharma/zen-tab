import { h, render, Fragment, VNode } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import browser from 'webextension-polyfill';
import { Store, broadcastMsgToServiceWorker, describeUrlPattern, extractDomainFromPattern, getUrlPatternValidationError, normalizeTabGroupRule, normalizeTabGroupRules, normalizeUrlPattern, openShortcutSettings, TAB_GROUP_COLORS, TAB_GROUP_COLOR_HEX } from "./utils";
import { StoreType, TabGroupColor, TabGroupRule } from './types';
import '../styles/settings.css';

type SectionId = 'general' | 'shortcuts' | 'tab-groups' | 'about';

const GeneralIcon = () => (
  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const ShortcutsIcon = () => (
  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M8 17h8" />
    <path d="M10 13h4" />
  </svg>
);

const AboutIcon = () => (
  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

const TabGroupsIcon = () => (
  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 3v14M2 8h6M16 3v14M16 8h6" />
    <path d="M2 21h20" />
  </svg>
);

const tabGroupRulesStore: Store<TabGroupRule[]> = new Store("tabGroupRules", StoreType.LOCAL);

const DOMAIN_RULE_EXAMPLES = [
  {
    pattern: 'https://example.com/*',
    description: 'Matches the main example.com domain on every path.',
  },
  {
    pattern: 'https://*.example.com/*',
    description: 'Matches example.com and any subdomain on every path.',
  },
  {
    pattern: 'https://*.example.com/specific_path',
    description: 'Matches a single exact path across example.com and its subdomains.',
  },
  {
    pattern: 'https://example.com/specific_path',
    description: 'Matches one exact path on the main example.com domain only.',
  },
  {
    pattern: '*://*.example.com/*',
    description: 'Matches both http and https across example.com and its subdomains.',
  },
  {
    pattern: 'https://*.example.com/specific_path/*',
    description: 'Matches a path prefix and anything below it on example.com subdomains.',
  },
] as const;

function buildEmptyRuleDraft(): TabGroupRule {
  return {
    id: '',
    pattern: '',
    title: '',
    color: undefined,
    collapsed: false,
    enabled: true,
  };
}

function TabGroupsSection() {
  const [rules, setRules] = useState<TabGroupRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>('new');
  const [draft, setDraft] = useState<TabGroupRule>(buildEmptyRuleDraft());
  const [patternError, setPatternError] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [groupingRuleId, setGroupingRuleId] = useState<string | null>(null);

  useEffect(() => {
    tabGroupRulesStore.get().then((storedRules) => {
      const normalizedRules = normalizeTabGroupRules(storedRules);
      setRules(normalizedRules);
      if (normalizedRules.length > 0) {
        setSelectedRuleId(normalizedRules[0].id);
        setDraft(normalizeTabGroupRule(normalizedRules[0]));
      }
    });
  }, []);

  const persist = async (newRules: TabGroupRule[]) => {
    const normalizedRules = normalizeTabGroupRules(newRules);
    setRules(normalizedRules);
    await tabGroupRulesStore.set(normalizedRules);
  };

  const selectRule = (rule: TabGroupRule) => {
    setSelectedRuleId(rule.id);
    setDraft(normalizeTabGroupRule(rule));
    setPatternError('');
  };

  const startCreate = () => {
    setSelectedRuleId('new');
    setDraft(buildEmptyRuleDraft());
    setPatternError('');
  };

  const updateDraft = (nextDraft: TabGroupRule) => {
    setDraft(nextDraft);
    if (patternError) {
      setPatternError('');
    }
  };

  const handleSubmit = async () => {
    const trimmedPattern = draft.pattern.trim();
    if (!trimmedPattern) {
      setPatternError('Pattern is required.');
      return;
    }

    const validationError = getUrlPatternValidationError(trimmedPattern);
    if (validationError) {
      setPatternError(validationError);
      return;
    }

    const normalizedPattern = normalizeUrlPattern(trimmedPattern);
    const duplicateRule = rules.find((rule) => rule.id !== draft.id && rule.pattern === normalizedPattern);
    if (duplicateRule) {
      setPatternError('That domain rule already exists.');
      return;
    }

    setPatternError('');
    const now = Date.now();

    if (selectedRuleId !== 'new' && draft.id) {
      const nextRules = rules.map((rule) =>
        rule.id === draft.id
          ? normalizeTabGroupRule({
              ...rule,
              pattern: normalizedPattern,
              title: draft.title?.trim() || undefined,
              color: draft.color,
              collapsed: !!draft.collapsed,
              enabled: draft.enabled !== false,
              updatedAt: now,
            })
          : rule
      );

      await persist(nextRules);
      const updatedRule = nextRules.find((rule) => rule.id === draft.id);
      if (updatedRule) {
        selectRule(updatedRule);
      }
    } else {
      const createdRule = normalizeTabGroupRule({
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        pattern: normalizedPattern,
        title: draft.title?.trim() || undefined,
        color: draft.color,
        collapsed: !!draft.collapsed,
        enabled: draft.enabled !== false,
        createdAt: now,
        updatedAt: now,
      });

      await persist([...rules, createdRule]);
      selectRule(createdRule);
    }
  };

  const deleteRule = async (id: string) => {
    const nextRules = rules.filter((rule) => rule.id !== id);
    await persist(nextRules);

    if (draft.id === id || selectedRuleId === id) {
      if (nextRules.length > 0) {
        selectRule(nextRules[0]);
      } else {
        startCreate();
      }
    }
  };

  const toggleRuleEnabled = async (rule: TabGroupRule) => {
    const nextRules = rules.map((item) =>
      item.id === rule.id
        ? normalizeTabGroupRule({
            ...item,
            enabled: item.enabled === false,
            updatedAt: Date.now(),
          })
        : item
    );

    await persist(nextRules);
    const updatedRule = nextRules.find((item) => item.id === rule.id);
    if (updatedRule && draft.id === updatedRule.id) {
      selectRule(updatedRule);
    }
  };

  const handleGroupNow = async (ruleId: string) => {
    setGroupingRuleId(ruleId);
    try {
      await broadcastMsgToServiceWorker({ action: 'groupTabsByRule', data: { ruleId } });
    } finally {
      setGroupingRuleId(null);
    }
  };

  const effectiveAutoTitle = extractDomainFromPattern(draft.pattern || 'https://tabs.example/*');
  const isEditing = selectedRuleId !== 'new' && !!draft.id;

  return (
    <Fragment>
      <div class="settings-section-header">
        <h1 class="settings-section-title">Tab Groups</h1>
        <p class="settings-section-subtitle">Create domain rules that automatically move matching tabs into a shared group.</p>
      </div>

      <div class="tg-stack">
        <section class="settings-group tg-rule-browser">
          <div class="tg-browser-header">
            <div>
              <div class="tg-browser-title">Domain Rules</div>
              <div class="settings-row-hint">Tabs are matched against rules from top to bottom.</div>
            </div>
            <div class="tg-header-actions">
              <button class="tg-help-button" onClick={() => setShowGuide((value) => !value)} title="Show URL guide">?</button>
              <button class="btn" onClick={startCreate}>New rule</button>
            </div>
          </div>

          {rules.length === 0 && (
            <div class="tg-empty-state">
              <div class="tg-empty-title">No rules yet</div>
              <div class="settings-row-hint">Create a domain rule to start grouping matching tabs automatically.</div>
            </div>
          )}

          {rules.length > 0 && (
            <div class="tg-rule-list">
              {rules.map((rule) => (
                <div key={rule.id} class={selectedRuleId === rule.id ? 'tg-rule-card active' : 'tg-rule-card'}>
                  <div class="tg-rule-card-head">
                    <div class="tg-rule-card-titleblock">
                      <button class="tg-edit-link" onClick={() => selectRule(rule)}>
                        <code class="tg-pattern">{rule.pattern}</code>
                      </button>
                      <div class="tg-rule-meta">
                        {rule.color
                          ? <span class="tg-color-swatch" style={`background:${TAB_GROUP_COLOR_HEX[rule.color]}`} title={rule.color} />
                          : <span class="tg-badge tg-badge-auto">auto color</span>
                        }
                        <span class="tg-badge">{rule.title || extractDomainFromPattern(rule.pattern)}</span>
                        {rule.collapsed ? <span class="tg-badge">collapsed</span> : null}
                      </div>
                    </div>
                    <span class={rule.enabled === false ? 'tg-status tg-status-off' : 'tg-status'}>{rule.enabled === false ? 'disabled' : 'enabled'}</span>
                  </div>
                  <div class="tg-rule-actions">
                    <button class="btn tg-small-btn" onClick={() => selectRule(rule)}>Edit</button>
                    <button class="btn tg-small-btn" onClick={() => toggleRuleEnabled(rule)}>
                      {rule.enabled === false ? 'Enable' : 'Disable'}
                    </button>
                    <button class="btn tg-small-btn primary" disabled={groupingRuleId === rule.id || rule.enabled === false} onClick={() => handleGroupNow(rule.id)}>
                      {groupingRuleId === rule.id ? 'Grouping...' : 'Group now'}
                    </button>
                    <button class="btn tg-small-btn tg-btn-delete" onClick={() => deleteRule(rule.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showGuide ? (
            <div class="tg-guide">
              <div class="tg-guide-title">Domain rule guide</div>
              {DOMAIN_RULE_EXAMPLES.map((example) => (
                <div key={example.pattern} class="tg-guide-item">
                  <code>{example.pattern}</code>
                  <p>{example.description}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section class="settings-group tg-config-panel">
          <div class="tg-config-header">
            <div>
              <div class="tg-browser-title">{isEditing ? 'Rule configuration' : 'Create a rule'}</div>
              <div class="settings-row-hint">Auto title uses the root domain. Auto color picks a random Chrome tab-group color when a group is created.</div>
            </div>
            {isEditing ? (
              <button class="btn tg-btn-delete" onClick={() => deleteRule(draft.id)}>Delete rule</button>
            ) : null}
          </div>

          <div class="tg-form-field">
            <label class="tg-label">Domain rule</label>
            <input
              class={`tg-input${patternError ? ' tg-input-error' : ''}`}
              type="text"
              value={draft.pattern}
              placeholder="https://*.example.com/*"
              onInput={(e) => updateDraft({ ...draft, pattern: (e.target as HTMLInputElement).value })}
            />
            {patternError ? <span class="tg-error-msg">{patternError}</span> : <span class="settings-row-hint">{describeUrlPattern(draft.pattern)}</span>}
          </div>

          <div class="tg-form-row-inline">
            <div class="tg-form-field tg-field-grow">
              <label class="tg-label">Group title <span class="tg-optional">(optional)</span></label>
              <input
                class="tg-input"
                type="text"
                value={draft.title || ''}
                placeholder={`Auto (${effectiveAutoTitle})`}
                onInput={(e) => updateDraft({ ...draft, title: (e.target as HTMLInputElement).value })}
              />
            </div>

            <div class="tg-form-field">
              <label class="tg-label">Color <span class="tg-optional">(optional)</span></label>
              <div class="tg-color-picker">
                <button
                  class={`tg-color-opt${!draft.color ? ' selected' : ''}`}
                  style="background:#444"
                  title="Auto (random)"
                  onClick={() => updateDraft({ ...draft, color: undefined })}
                />
                {TAB_GROUP_COLORS.map((groupColor) => (
                  <button
                    key={groupColor}
                    class={`tg-color-opt${draft.color === groupColor ? ' selected' : ''}`}
                    style={`background:${TAB_GROUP_COLOR_HEX[groupColor]}`}
                    title={groupColor}
                    onClick={() => updateDraft({ ...draft, color: groupColor as TabGroupColor })}
                  />
                ))}
              </div>
            </div>
          </div>

          <div class="settings-group tg-inline-settings">
            <div class="settings-row">
              <div class="settings-row-text">
                <span class="settings-row-label">Rule enabled</span>
                <span class="settings-row-hint">Disabled rules stay saved but stop moving tabs.</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={draft.enabled !== false}
                  onChange={(e) => updateDraft({ ...draft, enabled: (e.target as HTMLInputElement).checked })}
                />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="settings-row">
              <div class="settings-row-text">
                <span class="settings-row-label">Collapse group after grouping</span>
                <span class="settings-row-hint">Applies when the extension creates or refreshes the managed group.</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={!!draft.collapsed}
                  onChange={(e) => updateDraft({ ...draft, collapsed: (e.target as HTMLInputElement).checked })}
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div class="tg-preview-grid">
            <div class="tg-preview-card">
              <span class="tg-preview-label">Resolved title</span>
              <strong>{draft.title?.trim() || effectiveAutoTitle}</strong>
            </div>
            <div class="tg-preview-card">
              <span class="tg-preview-label">Resolved pattern</span>
              <code>{draft.pattern.trim() ? normalizeUrlPattern(draft.pattern) : 'https://*.example.com/*'}</code>
            </div>
          </div>

          <div class="settings-footer-actions">
            {isEditing ? <button class="btn" style={{marginRight: '1rem'}} onClick={startCreate}>Create another</button> : null}
            <button class="btn primary" onClick={handleSubmit}>
              {isEditing ? 'Save changes' : 'Add rule'}
            </button>
          </div>
        </section>
      </div>
    </Fragment>
  );
}

const NAV_SECTIONS: { id: SectionId; label: string; Icon: () => VNode }[] = [
  { id: 'general', label: 'General', Icon: GeneralIcon },
  { id: 'shortcuts', label: 'Shortcuts', Icon: ShortcutsIcon },
  { id: 'tab-groups', label: 'Tab Groups', Icon: TabGroupsIcon },
  { id: 'about', label: 'About', Icon: AboutIcon },
];

const searchTabStore: Store<boolean> = new Store("searchTab", StoreType.LOCAL);

function GeneralSection() {
  const [searchTab, setSearchTab] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    searchTabStore.get().then((val) => {
      setSearchTab(!!val);
      setReady(true);
    });
  }, []);

  const handleSearchTabChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const next = target.checked;
    setSearchTab(next);
    await searchTabStore.set(next);
  };

  return (
    <Fragment>
      <div class="settings-section-header">
        <h1 class="settings-section-title">General</h1>
        <p class="settings-section-subtitle">Core behavior for tab search and navigation.</p>
      </div>

      <div class="settings-group">
        <div class="settings-row">
          <div class="settings-row-text">
            <span class="settings-row-label">Search Tab overlay</span>
            <span class="settings-row-hint">Opens the search modal on the active page instead of the popup.</span>
          </div>
          <label class="toggle">
            <input
              type="checkbox"
              checked={searchTab}
              disabled={!ready}
              onChange={handleSearchTabChange}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </Fragment>
  );
}

function ShortcutsSection() {
  const [shortcuts, setShortcuts] = useState<browser.Commands.Command[]>([]);

  useEffect(() => {
    browser.commands.getAll().then((cmds) => {
      setShortcuts(
        cmds.filter((c) => c.name && c.name !== '_execute_action' && c.name !== '_execute_browser_action')
      );
    });
  }, []);

  const hasMissing = shortcuts.some((s) => !s.shortcut);

  return (
    <Fragment>
      <div class="settings-section-header">
        <h1 class="settings-section-title">Shortcuts</h1>
        <p class="settings-section-subtitle">Keyboard bindings are managed by your browser.</p>
      </div>

      <div class="settings-group">
        <table class="shortcut-table">
          <tbody>
            {shortcuts.map((s) => (
              <tr key={s.name}>
                <td>{s.description || s.name}</td>
                <td>
                  <kbd class={s.shortcut ? '' : 'missing'}>{s.shortcut || 'Unassigned'}</kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div class="settings-footer-actions">
        <button class="btn primary" onClick={openShortcutSettings}>
          {hasMissing ? 'Assign missing shortcuts' : 'Edit shortcuts in browser'}
        </button>
      </div>
    </Fragment>
  );
}

function AboutSection() {
  const manifest = browser.runtime.getManifest();

  return (
    <Fragment>
      <div class="settings-section-header">
        <h1 class="settings-section-title">About</h1>
        <p class="settings-section-subtitle">Tabaru - quick and simple tab management.</p>
      </div>

      <div class="settings-group">
        <ul class="about-list">
          <li><span>Version</span><span>{manifest.version}</span></li>
          <li><span>Author</span><span>{manifest.author as string || 'Sonu Sharma'}</span></li>
          <li>
            <span>Source</span>
            <a href="https://github.com/echosonusharma/tabaru" target="_blank" rel="noopener noreferrer">github.com/echosonusharma/tabaru</a>
          </li>
          <li>
            <span>Privacy Policy</span>
            <a href="https://github.com/echosonusharma/tabaru/blob/main/PRIVACY_POLICY.md" target="_blank" rel="noopener noreferrer">View privacy policy</a>
          </li>
        </ul>
      </div>
    </Fragment>
  );
}

function SettingsApp() {
  const [active, setActive] = useState<SectionId>(() => {
    const hash = window.location.hash.replace('#', '') as SectionId;
    return NAV_SECTIONS.some((s) => s.id === hash) ? hash : 'general';
  });

  useEffect(() => {
    window.location.hash = active;
    document.title = `Tabaru — ${NAV_SECTIONS.find((s) => s.id === active)?.label}`;
  }, [active]);

  const manifest = browser.runtime.getManifest();

  return (
    <div class="settings-shell">
      <aside class="settings-sidebar">
        <div class="settings-brand">
          <img class="settings-brand-icon" src={browser.runtime.getURL("images/tabaru-icon.svg")} alt="" />
          <span class="settings-brand-name">Tabaru</span>
          <span class="settings-brand-version">v{manifest.version}</span>
        </div>
        {NAV_SECTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            class={active === id ? 'settings-nav-item active' : 'settings-nav-item'}
            onClick={() => setActive(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </aside>

      <main class="settings-content">
        {active === 'general' && <GeneralSection />}
        {active === 'shortcuts' && <ShortcutsSection />}
        {active === 'tab-groups' && <TabGroupsSection />}
        {active === 'about' && <AboutSection />}
      </main>
    </div>
  );
}

const app = document.getElementById('app');
if (app) {
  render(<SettingsApp />, app as Element);
}
