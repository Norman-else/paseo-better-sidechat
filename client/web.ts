import { useEffect, useRef, useState } from "react";
import { Platform, type TextStyle, type ViewStyle } from "react-native";
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
      localStorage: {
        getItem(key: string): string | null;
        setItem?(key: string, value: string): void;
      };
      addEventListener(type: string, listener: (event: DomEvent) => void, capture?: boolean): void;
      removeEventListener(type: string, listener: (event: DomEvent) => void, capture?: boolean): void;
      getComputedStyle?(el: object): Record<string, string>;
      getSelection(): {
        isCollapsed: boolean;
        toString(): string;
        anchorNode: { nodeType: number; parentElement: DomElement | null } | null;
      } | null;
    }
  | undefined;

type WebMirrorTextareaElement = {
  rows: number;
  readOnly: boolean;
  value: string;
  scrollHeight: number;
  style: Record<string, string>;
  setAttribute(name: string, value: string): void;
  remove?(): void;
};

declare const document:
  | {
      documentElement: object;
      body?: {
        appendChild(el: WebFileInputElement | WebMirrorTextareaElement): void;
        removeChild(el: WebFileInputElement | WebMirrorTextareaElement): void;
      };
      createElement(tag: "input"): WebFileInputElement;
      createElement(tag: "textarea"): WebMirrorTextareaElement;
      createElement(tag: string): WebFileInputElement;
    }
  | undefined;

type WebBlobFile = {
  name: string;
  type: string;
  size: number;
};

type WebFileList = {
  length: number;
  [index: number]: WebBlobFile | undefined;
};

type WebFileInputElement = {
  type: string;
  accept: string;
  multiple: boolean;
  style: Record<string, string>;
  files: WebFileList | null;
  onchange: (() => void) | null;
  oncancel?: (() => void) | null;
  click(): void;
  remove?(): void;
};

declare const FileReader:
  | (new () => {
      result: string | ArrayBuffer | null;
      onload: (() => void) | null;
      onerror: (() => void) | null;
      readAsDataURL(file: WebBlobFile): void;
    })
  | undefined;

export interface PickedWebFile {
  fileName: string;
  mimeType: string;
  size: number;
  dataBase64: string;
}

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
export interface AutocompleteKeyboardHandlers {
  isOpen: boolean;
  hasOptions: boolean;
  onMove(delta: -1 | 1): void;
  onConfirm(): void;
  onDismiss(): void;
}

export function composerWebKeyProps(
  sendShortcut: SendShortcutMode,
  onSubmit: () => void,
  autocomplete?: AutocompleteKeyboardHandlers,
): Record<string, unknown> {
  if (Platform.OS !== "web") return {};
  return {
    onKeyPress: (syntheticEvent: { nativeEvent?: DomEvent; preventDefault?: () => void }) => {
      const ev = syntheticEvent.nativeEvent;
      if (!ev || !ev.key) return;
      // Never intercept Chinese/Japanese/Korean IME composition!
      if (ev.isComposing || ev.keyCode === 229) return;

      if (autocomplete?.isOpen) {
        if (ev.key === "Escape") {
          ev.preventDefault?.();
          syntheticEvent.preventDefault?.();
          autocomplete.onDismiss();
          return;
        }
        if (autocomplete.hasOptions) {
          if (ev.key === "ArrowDown") {
            ev.preventDefault?.();
            syntheticEvent.preventDefault?.();
            autocomplete.onMove(1);
            return;
          }
          if (ev.key === "ArrowUp") {
            ev.preventDefault?.();
            syntheticEvent.preventDefault?.();
            autocomplete.onMove(-1);
            return;
          }
          if (
            ev.key === "Tab" ||
            (ev.key === "Enter" && !ev.shiftKey && !ev.altKey && !ev.metaKey && !ev.ctrlKey)
          ) {
            ev.preventDefault?.();
            syntheticEvent.preventDefault?.();
            autocomplete.onConfirm();
            return;
          }
        }
      }

      if (ev.key !== "Enter") return;
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

function readBlobFileAsBase64(
  file: WebBlobFile,
  fallbackMime: string,
  fallbackName?: string,
): Promise<PickedWebFile> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("FileReader is unavailable"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name || "file"}`));
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const comma = raw.indexOf(",");
      const dataBase64 = comma >= 0 ? raw.slice(comma + 1) : raw;
      resolve({
        fileName: file.name || fallbackName || "attachment",
        mimeType: file.type || fallbackMime,
        size: file.size ?? 0,
        dataBase64,
      });
    };
    reader.readAsDataURL(file);
  });
}

export function pickWebFiles(options: {
  accept?: string;
  multiple?: boolean;
  fallbackMime?: string;
}): Promise<PickedWebFile[]> {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return Promise.resolve([]);
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = options.accept ?? "";
    input.multiple = options.multiple !== false;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.opacity = "0";
    document.body?.appendChild(input);

    let settled = false;
    const cleanup = () => {
      if (input.remove) {
        input.remove();
      } else {
        try {
          document.body?.removeChild(input);
        } catch {
          // Ignore if already detached
        }
      }
    };

    input.oncancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve([]);
    };

    input.onchange = () => {
      if (settled) return;
      settled = true;
      const list = input.files;
      const selected: WebBlobFile[] = [];
      if (list) {
        for (let i = 0; i < list.length; i += 1) {
          const item = list[i];
          if (item) selected.push(item);
        }
      }
      cleanup();
      if (selected.length === 0) {
        resolve([]);
        return;
      }
      Promise.all(
        selected.map((f) =>
          readBlobFileAsBase64(f, options.fallbackMime ?? "application/octet-stream"),
        ),
      ).then(resolve, reject);
    };

    input.click();
  });
}

export function composerPasteImageProps(
  onPasteImages: (files: PickedWebFile[]) => void,
): Record<string, unknown> {
  if (Platform.OS !== "web") return {};
  return {
    onPaste: (syntheticEvent: {
      nativeEvent?: {
        clipboardData?: {
          items?: {
            length: number;
            [index: number]:
              | { kind?: string; type?: string; getAsFile?: () => WebBlobFile | null }
              | undefined;
          };
        };
        preventDefault?: () => void;
      };
      preventDefault?: () => void;
    }) => {
      const items = syntheticEvent.nativeEvent?.clipboardData?.items;
      if (!items) return;
      const imageBlobs: WebBlobFile[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item?.kind === "file" && item.type?.startsWith("image/")) {
          const blob = item.getAsFile?.();
          if (blob) imageBlobs.push(blob);
        }
      }
      if (imageBlobs.length === 0) return;
      syntheticEvent.nativeEvent?.preventDefault?.();
      syntheticEvent.preventDefault?.();
      void Promise.all(
        imageBlobs.map((blob, idx) =>
          readBlobFileAsBase64(blob, "image/png", `pasted-image-${idx + 1}.png`).catch(() => null),
        ),
      ).then((resolved) => {
        const valid = resolved.filter((f): f is PickedWebFile => f !== null);
        if (valid.length > 0) onPasteImages(valid);
      });
    },
  };
}

export const PASEO_COMPOSER_WEB_MIN_HEIGHT = 46;
export const PASEO_COMPOSER_NATIVE_MIN_HEIGHT = 30;
export const PASEO_COMPOSER_MAX_HEIGHT = 200;

/**
 * Matches Paseo's `useComposerHeight` (`ie = Platform.OS === "web" ? 46 : 30`):
 * - Resting height on Web is an exact 46px (`minHeight: 46`), matching Paseo's native `MessageInput`.
 * - Smoothly auto-expands up to `maxHeight` (200px) when multiline text exceeds 46px, and resets
 *   immediately to 46px when the draft is cleared.
 */
export function useComposerInputSizing(input: {
  value: string;
  surfaceWidth: number;
  contentFontSize: number;
  lineHeight: number;
}): { style: TextStyle; scrollEnabled: boolean } {
  const [webHeight, setWebHeight] = useState(PASEO_COMPOSER_WEB_MIN_HEIGHT);
  const mirrorRef = useRef<WebMirrorTextareaElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !document.body) {
      return;
    }
    const mirror = document.createElement("textarea");
    mirror.setAttribute("aria-hidden", "true");
    mirror.setAttribute("tabindex", "-1");
    mirror.readOnly = true;
    mirror.rows = 1;
    Object.assign(mirror.style, {
      position: "absolute",
      top: "0",
      left: "0",
      visibility: "hidden",
      pointerEvents: "none",
      overflow: "hidden",
      border: "0",
      margin: "0",
      padding: "0",
      resize: "none",
      zIndex: "-1",
      boxSizing: "border-box",
      whiteSpace: "pre-wrap",
      overflowWrap: "break-word",
    });
    document.body.appendChild(mirror);
    mirrorRef.current = mirror;
    return () => {
      if (mirror.remove) {
        mirror.remove();
      } else {
        try {
          document.body?.removeChild(mirror);
        } catch {
          // Ignore if already detached
        }
      }
      mirrorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!input.value) {
      setWebHeight(PASEO_COMPOSER_WEB_MIN_HEIGHT);
      return;
    }
    const mirror = mirrorRef.current;
    if (!mirror || input.surfaceWidth <= 0) return;

    if (typeof window !== "undefined" && window.getComputedStyle && document?.body) {
      const bodyComputed = window.getComputedStyle(document.body);
      if (bodyComputed.fontFamily) {
        mirror.style.fontFamily = bodyComputed.fontFamily;
      }
    }
    mirror.style.width = `${Math.max(80, Math.floor(input.surfaceWidth))}px`;
    mirror.style.fontSize = `${input.contentFontSize}px`;
    mirror.style.lineHeight = `${input.lineHeight}px`;
    mirror.value = input.value.endsWith("\n") ? `${input.value} ` : input.value;

    const raw = mirror.scrollHeight || PASEO_COMPOSER_WEB_MIN_HEIGHT;
    const clamped = Math.max(
      PASEO_COMPOSER_WEB_MIN_HEIGHT,
      Math.min(PASEO_COMPOSER_MAX_HEIGHT, Math.ceil(raw)),
    );
    setWebHeight((prev) => (Math.abs(prev - clamped) < 1 ? prev : clamped));
  }, [input.value, input.surfaceWidth, input.contentFontSize, input.lineHeight]);

  if (Platform.OS !== "web") {
    return {
      style: {
        minHeight: PASEO_COMPOSER_NATIVE_MIN_HEIGHT,
        maxHeight: 160,
      },
      scrollEnabled: true,
    };
  }

  const resolvedHeight = input.value ? webHeight : PASEO_COMPOSER_WEB_MIN_HEIGHT;
  return {
    style: {
      height: resolvedHeight,
      minHeight: PASEO_COMPOSER_WEB_MIN_HEIGHT,
      maxHeight: PASEO_COMPOSER_MAX_HEIGHT,
    },
    scrollEnabled: resolvedHeight >= PASEO_COMPOSER_MAX_HEIGHT,
  };
}

export function readDeviceStorageItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeDeviceStorageItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem?.(key, value);
  } catch {
    // Ignore storage quota / private browsing errors
  }
}

/**
 * Evaluates a Paseo compiled plugin `clientBundle` (`(function(require) { ... })`)
 * in the exact same manner as Paseo's `runPluginClientBundle` (`MOD 3978`).
 */
export function evaluateCommonJsFactoryBundle(
  pluginId: string,
  bundleCode: string,
): (requireFn: (specifier: string) => unknown) => unknown {
  const indirectEval = globalThis.eval;
  const factory: unknown = indirectEval(bundleCode);
  if (typeof factory !== "function") {
    throw new Error(`Plugin ${pluginId} client bundle is not executable`);
  }
  return factory as (requireFn: (specifier: string) => unknown) => unknown;
}
