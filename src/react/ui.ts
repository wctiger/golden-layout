/** Where a tab menu was opened, in viewport coordinates. */
export interface TabMenuState {
  panelId: string;
  x: number;
  y: number;
}

/**
 * Transient interface state for one mounted layout: which tab title is being edited and
 * which tab menu is open. It is deliberately not part of the layout state, so it is never
 * saved and never reported through `onChange`.
 */
export class UiStore {
  private renaming: string | null = null;
  private menu: TabMenuState | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getRenaming = (): string | null => this.renaming;
  getMenu = (): TabMenuState | null => this.menu;

  startRename(panelId: string): void {
    this.menu = null;
    this.renaming = panelId;
    this.emit();
  }

  stopRename(): void {
    if (this.renaming === null) return;
    this.renaming = null;
    this.emit();
  }

  openMenu(menu: TabMenuState): void {
    this.menu = menu;
    this.emit();
  }

  closeMenu(): void {
    if (this.menu === null) return;
    this.menu = null;
    this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
