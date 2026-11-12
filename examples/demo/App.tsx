import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  GoldenLayout,
  createLayout,
  useDragSource,
  useLayoutSelector,
  usePanel,
  usePanelSize,
  usePanelState,
  usePanelVisible,
} from '../../src/index';
import type {
  Layout,
  LayoutConfig,
  Side,
  StackActionsContext,
  TabMenuContext,
  TabMenuItem,
} from '../../src/index';

const STORAGE_KEY = 'golden-layout-demo';

const initialLayout: LayoutConfig = {
  root: {
    type: 'row',
    children: [
      {
        type: 'column',
        size: 1,
        children: [
          { type: 'panel', id: 'welcome', component: 'welcome', title: 'Welcome' },
          { type: 'panel', id: 'saved', component: 'saved', title: 'Saved layout' },
        ],
      },
      {
        type: 'stack',
        size: 2,
        children: [
          { type: 'panel', id: 'counter-1', component: 'counter', title: 'Counter 1' },
          { type: 'panel', id: 'notes-1', component: 'notes', title: 'Notes' },
          { type: 'panel', id: 'pinned', component: 'info', title: 'Pinned', closable: false },
        ],
      },
    ],
  },
};

function loadLayout(): LayoutConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as LayoutConfig) : initialLayout;
  } catch {
    return initialLayout;
  }
}

function Welcome(): ReactNode {
  return (
    <div className="demo-panel">
      <h3>golden-layout</h3>
      <p>Drag tabs to reorder them, move them to another stack, or dock them against a side.</p>
      <p>
        Drag a header's empty background to move a whole stack. Drag the bars between panels to
        resize.
      </p>
      <p>Drag a chip from the toolbar to add a panel. Press Escape to cancel a drag.</p>
      <p>Double-click a tab title to rename it. Right-click a tab for its menu.</p>
      <p>The + in each header is a custom stack action.</p>
    </div>
  );
}

/** Local state survives re-docking because the panel is never remounted. */
function Counter(): ReactNode {
  const [local, setLocal] = useState(0);
  const [saved, setSaved] = usePanelState({ count: 0 });
  const panel = usePanel();
  return (
    <div className="demo-panel">
      <h3>{panel.id}</h3>
      <p>
        <button type="button" onClick={() => setLocal((n) => n + 1)}>
          useState: {local}
        </button>{' '}
        kept while the panel is mounted, wherever it moves.
      </p>
      <p>
        <button type="button" onClick={() => setSaved((s) => ({ count: s.count + 1 }))}>
          usePanelState: {saved.count}
        </button>{' '}
        stored in the layout, so it is saved and restored with it.
      </p>
      <p>
        <button type="button" onClick={() => panel.setTitle(`Counter (${saved.count})`)}>
          Put the count in the title
        </button>
      </p>
    </div>
  );
}

function Notes(): ReactNode {
  const [state, setState] = usePanelState({ text: '' });
  return (
    <div className="demo-panel">
      <h3>Notes</h3>
      <textarea
        value={state.text}
        placeholder="Typed text is part of the saved layout."
        onChange={(event) => setState({ text: event.target.value })}
      />
    </div>
  );
}

function Info(): ReactNode {
  const size = usePanelSize();
  const visible = usePanelVisible();
  return (
    <div className="demo-panel">
      <h3>Panel info</h3>
      <p>
        Size: {size.width} x {size.height}
      </p>
      <p>Visible: {String(visible)}</p>
    </div>
  );
}

function Saved(): ReactNode {
  const state = useLayoutSelector((s) => s);
  return (
    <div className="demo-panel">
      <h3>Saved layout (live)</h3>
      <textarea readOnly value={JSON.stringify(state, null, 2)} />
    </div>
  );
}

const components = { welcome: Welcome, counter: Counter, notes: Notes, info: Info, saved: Saved };

let created = 1;

/** A "+" in every stack header that adds a counter next to the active tab. */
function renderStackActions({ layout, stack }: StackActionsContext): ReactNode {
  return (
    <button
      type="button"
      className="gl-control"
      title="add a counter to this stack"
      onClick={() =>
        layout.addPanel(
          { component: 'counter', title: `Counter ${++created}` },
          { parent: stack.id },
        )
      }
    >
      +
    </button>
  );
}

/** The default tab menu plus one entry of our own. */
function tabContextMenu(_context: TabMenuContext, defaults: TabMenuItem[]): TabMenuItem[] {
  return [
    ...defaults,
    {
      id: 'duplicate',
      label: 'Duplicate',
      separatorBefore: true,
      onSelect: ({ layout, panel, stack, index }) =>
        layout.addPanel(
          { component: panel.component, title: `${panel.title} copy`, state: panel.state },
          { parent: stack.id, index: index + 1 },
        ),
    },
  ];
}

export function App(): ReactNode {
  const layout = useMemo(() => createLayout(loadLayout()), []);
  const [theme, setTheme] = useState('dark');
  const [selection, setSelection] = useState(true);
  const [headers, setHeaders] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const setHeaderSide = (side: Side): void => {
    const node = selectedId ? layout.getById(selectedId) : undefined;
    if (node?.type === 'stack') layout.updateItem(node.id, { headerPosition: side });
  };

  return (
    <div className="demo">
      <div className="demo-toolbar">
        <label>
          Theme
          <select value={theme} onChange={(event) => setTheme(event.target.value)}>
            <option value="">base (no theme)</option>
            <option value="dark">dark</option>
            <option value="light">light</option>
            <option value="soda">soda</option>
            <option value="translucent">translucent</option>
          </select>
        </label>
        <span className="group">
          Drag in:
          <DragChips layoutHandle={layout} />
        </span>
        <label>
          <input type="checkbox" checked={headers} onChange={(e) => setHeaders(e.target.checked)} />
          headers
        </label>
        <label>
          <input
            type="checkbox"
            checked={selection}
            onChange={(e) => setSelection(e.target.checked)}
          />
          selection (click a header)
        </label>
        <label>
          Header of selected stack
          <select
            value=""
            disabled={selectedId === null}
            onChange={(event) => setHeaderSide(event.target.value as Side)}
          >
            <option value="" disabled>
              {selectedId ?? 'none selected'}
            </option>
            <option value="top">top</option>
            <option value="bottom">bottom</option>
            <option value="left">left</option>
            <option value="right">right</option>
          </select>
        </label>
        <span className="group">
          <button
            type="button"
            onClick={() => localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))}
          >
            Save
          </button>
          <button type="button" onClick={() => layout.setLayout(loadLayout())}>
            Restore
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              layout.setLayout(initialLayout);
            }}
          >
            Reset
          </button>
        </span>
      </div>
      <div className="demo-layout">
        <GoldenLayout
          layout={layout}
          components={components}
          className={theme ? `gl-theme-${theme}` : undefined}
          settings={{ selectionEnabled: selection, hasHeaders: headers }}
          renderStackActions={renderStackActions}
          tabContextMenu={tabContextMenu}
          onChange={(state) => setSelectedId(state.selectedId)}
        />
      </div>
    </div>
  );
}

function DragChips({ layoutHandle }: { layoutHandle: Layout }): ReactNode {
  return (
    <>
      <OutsideChip layoutHandle={layoutHandle} label="Counter" component="counter" />
      <OutsideChip layoutHandle={layoutHandle} label="Notes" component="notes" />
      <OutsideChip layoutHandle={layoutHandle} label="Info" component="info" />
    </>
  );
}

/** A drag source outside the layout tree: it names the layout it drops into. */
function OutsideChip(props: { layoutHandle: Layout; label: string; component: string }): ReactNode {
  const source = useDragSource(
    () => ({
      type: 'panel',
      component: props.component,
      title: `${props.label} ${++created}`,
    }),
    { layout: props.layoutHandle, title: props.label },
  );
  return (
    <span className="demo-chip" {...source}>
      + {props.label}
    </span>
  );
}
