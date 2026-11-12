import { Profiler, useEffect, useMemo, useState } from 'react';
import type { ComponentType, ProfilerOnRenderCallback, ReactNode } from 'react';
import {
  GoldenLayout,
  createLayout,
  useDragSource,
  usePanel,
  usePanelVisible,
} from '../../src/index';
import type { Layout, LayoutConfig } from '../../src/index';
import { DARK_COLORS, LIGHT_COLORS, PanelColorsContext } from './colors';
import { Activity, HiddenPolicyContext, VisibilityGate } from './kit';
import type { HiddenPolicy } from './kit';
import { MarketProvider } from './market';
import { ChartPanel } from './panels/chartPanel';
import { CorrelationPanel } from './panels/correlationPanel';
import { FxTilesPanel } from './panels/fxTilesPanel';
import { NewsPanel } from './panels/newsPanel';
import { OrderBookPanel } from './panels/orderBookPanel';
import { OrdersPanel } from './panels/ordersPanel';
import { PositionSummaryPanel } from './panels/positionSummaryPanel';
import { PriceAlertPanel } from './panels/priceAlertPanel';
import { SignalsPanel } from './panels/signalsPanel';
import { VolSurfacePanel } from './panels/volSurfacePanel';
import { WatchlistPanel } from './panels/watchlistPanel';

/** Every panel type, with the title a new one gets. */
const CATALOG: { component: string; title: string; render: ComponentType }[] = [
  { component: 'orderbook', title: 'Order Book', render: OrderBookPanel },
  { component: 'chart', title: 'Chart', render: ChartPanel },
  { component: 'watchlist', title: 'Watchlist', render: WatchlistPanel },
  { component: 'fxtiles', title: 'FX Rates', render: FxTilesPanel },
  { component: 'orders', title: 'Orders', render: OrdersPanel },
  { component: 'positionsummary', title: 'Positions', render: PositionSummaryPanel },
  { component: 'pricealert', title: 'Price Alert', render: PriceAlertPanel },
  { component: 'signals', title: 'Tech View', render: SignalsPanel },
  { component: 'correlation', title: 'Correlation', render: CorrelationPanel },
  { component: 'volsurface', title: 'Vol Surface', render: VolSurfacePanel },
  { component: 'news', title: 'News', render: NewsPanel },
];

const panel = (id: string, component: string, title: string) =>
  ({ type: 'panel', id, component, title }) as const;

/** The same arrangement as dockview's demo, without its side and bottom edge groups. */
const initialLayout: LayoutConfig = {
  root: {
    type: 'row',
    children: [
      {
        type: 'column',
        size: 461,
        children: [
          { type: 'stack', children: [panel('correlation', 'correlation', 'Correlation')] },
          { type: 'stack', children: [panel('orderbook', 'orderbook', 'Order Book')] },
        ],
      },
      {
        type: 'column',
        size: 715,
        children: [
          { type: 'stack', children: [panel('fxtiles', 'fxtiles', 'FX Rates')] },
          {
            type: 'stack',
            children: [
              panel('orders', 'orders', 'Orders'),
              panel('positionsummary', 'positionsummary', 'Positions'),
            ],
          },
          { type: 'stack', children: [panel('volsurface', 'volsurface', 'Vol Surface')] },
        ],
      },
      {
        type: 'column',
        size: 354,
        children: [
          { type: 'stack', children: [panel('news', 'news', 'News')] },
          { type: 'stack', children: [panel('signals', 'signals', 'Tech View')] },
        ],
      },
    ],
  },
};

/* ------------------------------------------------------------ render meter */

// Panel renders since the last reading, split by whether the panel was on screen.
const renders = { visible: 0, hidden: 0 };
const countRender: ProfilerOnRenderCallback = (id) => {
  if (id.startsWith('hidden:')) renders.hidden++;
  else renders.visible++;
};

/**
 * Wraps a panel so its renders are counted, and applies the hidden-panel policy. The
 * Profiler sits outside the gate, so an unmounted or paused panel counts nothing.
 */
function metered(Content: ComponentType): ComponentType {
  function MeteredPanel(): ReactNode {
    const { id } = usePanel();
    const visible = usePanelVisible();
    return (
      <Profiler id={`${visible ? 'visible' : 'hidden'}:${id}`} onRender={countRender}>
        <VisibilityGate>
          <Content />
        </VisibilityGate>
      </Profiler>
    );
  }
  return MeteredPanel;
}

const components = Object.fromEntries(
  CATALOG.map((entry) => [entry.component, metered(entry.render)]),
);

function RenderMeter(): ReactNode {
  const [rate, setRate] = useState({ visible: 0, hidden: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      setRate({ ...renders });
      renders.visible = 0;
      renders.hidden = 0;
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className="trade-meter"
      title="Panel renders per second, counted with React's Profiler. Hidden means an inactive tab or a panel behind a maximized stack."
    >
      renders/s: {rate.visible} visible · {rate.hidden} hidden
    </span>
  );
}

/* ----------------------------------------------------------------- toolbar */

let created = 0;

/** Where a clicked chip adds its panel: the selected stack, else the first stack. */
function targetStack(layout: Layout): string | undefined {
  const selected = layout.getState().selectedId;
  const node = selected ? layout.getById(selected) : undefined;
  if (node?.type === 'stack') return node.id;
  return layout.filter((item) => item.type === 'stack')[0]?.id;
}

/** Drag it into the layout to dock a new panel there, or click it to add one. */
function PanelChip(props: { layout: Layout; component: string; title: string }): ReactNode {
  const config = () => ({
    type: 'panel' as const,
    id: `${props.component}-${++created}`,
    component: props.component,
    title: props.title,
  });
  const source = useDragSource(config, { layout: props.layout, title: props.title });
  return (
    <button
      type="button"
      {...source}
      onClick={() => {
        const parent = targetStack(props.layout);
        const { type: _type, ...item } = config();
        props.layout.addPanel(item, parent ? { parent } : undefined);
      }}
    >
      + {props.title}
    </button>
  );
}

const POLICIES: { value: HiddenPolicy; label: string; disabled?: boolean }[] = [
  { value: 'live', label: 'keep rendering (library default)' },
  { value: 'activity', label: 'pause with <Activity>', disabled: !Activity },
  { value: 'unmount', label: 'unmount (as dockview’s demo)' },
];

export function App(): ReactNode {
  const layout = useMemo(() => createLayout(initialLayout), []);
  const [dark, setDark] = useState(true);
  const [policy, setPolicy] = useState<HiddenPolicy>('live');

  return (
    <div className={`trade-app ${dark ? 'trade-dark' : 'trade-light'}`}>
      <div className="trade-toolbar">
        <h1>Trading desk</h1>
        <label>
          Theme
          <select
            value={dark ? 'dark' : 'light'}
            onChange={(e) => setDark(e.target.value === 'dark')}
          >
            <option value="dark">dark</option>
            <option value="light">light</option>
          </select>
        </label>
        <label>
          Hidden panels
          <select value={policy} onChange={(e) => setPolicy(e.target.value as HiddenPolicy)}>
            {POLICIES.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Add
          {CATALOG.filter((entry) =>
            ['chart', 'watchlist', 'pricealert', 'orderbook'].includes(entry.component),
          ).map((entry) => (
            <PanelChip key={entry.component} layout={layout} {...entry} />
          ))}
        </label>
        <button type="button" onClick={() => layout.setLayout(initialLayout)}>
          Reset layout
        </button>
        <a href="./simple/">Simple demo</a>
        <RenderMeter />
      </div>
      <div className="trade-layout">
        <PanelColorsContext.Provider value={dark ? DARK_COLORS : LIGHT_COLORS}>
          <HiddenPolicyContext.Provider value={policy}>
            <MarketProvider>
              <GoldenLayout layout={layout} components={components} />
            </MarketProvider>
          </HiddenPolicyContext.Provider>
        </PanelColorsContext.Provider>
      </div>
    </div>
  );
}
