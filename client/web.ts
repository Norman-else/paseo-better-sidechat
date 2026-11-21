import { useEffect, useState } from "react";
import { Platform, type ViewStyle } from "react-native";
import {
  DEFAULT_WEB_MONO_FONT,
  parseHostAppearanceSettings,
  sameHostAppearance,
  type HostAppearanceSettings,
  type SendShortcutMode,
} from "../shared/appearance";

// Strictly isolated browser/Electron bridge so `tsconfig.json` stays pure `ES2023` (no DOM lib).
type DomElement = {
  nodeType: number;
  parentElement: DomElement | null;
  closest(selector: string): DomElement | null;
  dataset: Record<string, string | undefined>;
};

type DomEvent = {
  key?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  target?: DomElement | null;
  preventDefault?(): void;
  stopPropagation?(): void;
};

declare const window:
  | {
      localStorage: { getItem(key: string): string | null };
      addEventListener(type: string, listener: (event: DomEvent) => void, capture?: boolean): void;
      removeEventListener(type: string, listener: (event: DomEvent) => void, capture?: boolean): void;
      getSelection(): {
        isCollapsed: boolean;
        toString(): string;
        anchorNode: { nodeType: number; parentElement: DomElement | null } | null;
      } | null;
    }
  | undefined;

declare const document: { documentElement: object } | undefined;

declare const MutationObserver:
  | (new (callback: () => void) => {
      observe(target: object, options: { attributes: boolean; attributeFilter: string[] }): void;
      disconnect(): void;
    })
  | undefined;

export const stableScrollbarStyle: ViewStyle | undefined =
  Platform.OS === "web" ? ({ scrollbarGutter: "stable" } as unknown as ViewStyle) : undefined;

export const noOutlineInputStyle =
  Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as Record<string, unknown>) : {};

export const pointerCursorStyle: ViewStyle | undefined =
  Platform.OS === "web" ? ({ cursor: "pointer" } as unknown as ViewStyle) : undefined;

/** Opts code blocks out of Paseo's global `:not([data-pmono])` UI font override. */
export const codeScopeProps: Record<string, unknown> =
  Platform.OS === "web" ? { dataSet: { pmono: "true" } } : {};

export function panelScopeProps(scopeId: string): Record<string, unknown> {
  return Platform.OS === "web" ? { dataSet: { sidechatPanelScope: scopeId } } : {};
}

export function popoverScopeProps(scopeId: string): Record<string, unknown> {
  return Platform.OS === "web" ? { dataSet: { sidechatPopoverScope: scopeId } } : {};
}

function defaultMonoForPlatform(): string {
  if (Platform.OS === "ios") return "ui-monospace";
  if (Platform.OS === "android") return "monospace";
  return DEFAULT_WEB_MONO_FONT;
}

export function readHostAppearance(): HostAppearanceSettings {
  const native = Platform.OS !== "web";
  const fallbackMonoFont = defaultMonoForPlatform();
  if (native || typeof window === "undefined") {
    return parseHostAppearanceSettings(null, { native, fallbackMonoFont });
  }
  try {
    const raw =
      window.localStorage.getItem("@paseo:app-settings") ??
      window.localStorage.getItem("@paseo:settings");
    return parseHostAppearanceSettings(raw ? JSON.parse(raw) : null, {
      native: false,
      fallbackMonoFont,
    });
  } catch {
    return parseHostAppearanceSettings(null, { native: false, fallbackMonoFont });
  }
}

export function watchHostAppearance(
  onChange: (next: HostAppearanceSettings) => void,
): () => void {
  if (Platform.OS !== "web" || typeof window === "undefined") return () => {};
  let current = readHostAppearance();
  const check = () => {
    const next = readHostAppearance();
    if (sameHostAppearance(current, next)) return;
    current = next;
    onChange(next);
  };
  window.addEventListener("storage", check);
  window.addEventListener("focus", check);
  const observer =
    typeof MutationObserver !== "undefined" ? new MutationObserver(check) : null;
  if (typeof document !== "undefined" && observer) {
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }
  const interval = setInterval(check, 750);
  return () => {
    clearInterval(interval);
    observer?.disconnect();
    window.removeEventListener("storage", check);
    window.removeEventListener("focus", check);
  };
}

export function useHostAppearance(): HostAppearanceSettings {
  const [appearance, setAppearance] = useState<HostAppearanceSettings>(() =>
    readHostAppearance(),
  );
  useEffect(() => {
    setAppearance(readHostAppearance());
    return watchHostAppearance(setAppearance);
  }, []);
  return appearance;
}

export function watchPopoverDismiss(scopeId: string, close: () => void): () => void {
  if (Platform.OS !== "web" || typeof window === "undefined") return () => {};
  const onOutside = (event: DomEvent) => {
    const match = event.target?.closest?.("[data-sidechat-popover-scope]");
    if (match?.dataset.sidechatPopoverScope !== scopeId) {
      close();
    }
  };
  const onKey = (event: DomEvent) => {
    if (event.key === "Escape") {
      event.preventDefault?.();
      event.stopPropagation?.();
      close();
    }
  };
  const entries = [
    ["pointerdown", onOutside, true],
    ["focusin", onOutside, true],
    ["keydown", onKey, true],
    ["resize", close, false],
    ["blur", close, false],
  ] as const;
  for (const [type, fn, capture] of entries) {
    window.addEventListener(type, fn, capture);
  }
  return () => {
    for (const [type, fn, capture] of entries) {
      window.removeEventListener(type, fn, capture);
    }
  };
}

/**
 * Watches text selections made OUTSIDE this Sidechat panel (e.g., in the main Claude chat or diff)
 * so the user can attach a highlighted snippet into Sidechat in one click.
 */
export function watchExternalSelection(
  panelScopeId: string,
  onSelected: (text: string | null) => void,
): () => void {
  if (Platform.OS !== "web" || typeof window === "undefined") return () => {};
  const check = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const raw = sel.toString().trim();
    if (!raw || raw.length < 2) return;
    const node = sel.anchorNode;
    const el = (node?.nodeType === 1 ? (node as unknown as DomElement) : node?.parentElement) ?? null;
    const insideOwnPanel =
      el?.closest?.("[data-sidechat-panel-scope]")?.dataset.sidechatPanelScope === panelScopeId;
    if (insideOwnPanel) return;
    onSelected(raw.length > 2400 ? `${raw.slice(0, 2400)}…` : raw);
  };
  window.addEventListener("mouseup", check);
  return () => {
    window.removeEventListener("mouseup", check);
  };
}

/**
 * IME-safe Enter / Cmd+Enter key handler for React Native Web's multiline TextInput,
 * honoring Paseo's `sendShortcut` ("enter" vs "mod-enter").
 */
export function composerWebKeyProps(
  sendShortcut: SendShortcutMode,
  onSubmit: () => void,
): Record<string, unknown> {
  if (Platform.OS !== "web") return {};
  return {
    onKeyPress: (syntheticEvent: { nativeEvent?: DomEvent; preventDefault?: () => void }) => {
      const ev = syntheticEvent.nativeEvent;
      if (!ev || ev.key !== "Enter") return;
      // Never intercept Chinese/Japanese/Korean IME composition!
      if (ev.isComposing || ev.keyCode === 229) return;
      if (sendShortcut === "mod-enter") {
        if (ev.metaKey || ev.ctrlKey) {
          ev.preventDefault?.();
          syntheticEvent.preventDefault?.();
          onSubmit();
        }
        return;
      }
      // `sendShortcut === "enter"`: Enter submits, Shift+Enter inserts newline.
      if (!ev.shiftKey && !ev.altKey) {
        ev.preventDefault?.();
        syntheticEvent.preventDefault?.();
        onSubmit();
      }
    },
  };
}
