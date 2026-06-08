"use client";
import { useEffect, useState } from "react";
import type { Signal } from "./types";

const EVT = "jotter-saved-changed";

function readKey<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeKey(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(EVT));
}

function useStore<T>(key: string, fallback: T): T {
  const [val, setVal] = useState<T>(fallback);
  useEffect(() => {
    const sync = () => setVal(readKey(key, fallback));
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return val;
}

/* ---------------- saved entries (pinned signals) ---------------- */
export type SavedItem = { signal: Signal; tags: string[]; savedAt: number; note?: string };
type SavedStore = Record<string, SavedItem>;
const KEY_SAVED = "jotter.saved.v1";

export function toggleSave(signal: Signal) {
  const store = readKey<SavedStore>(KEY_SAVED, {});
  if (store[signal.id]) delete store[signal.id];
  else store[signal.id] = { signal, tags: [], savedAt: Date.now() };
  writeKey(KEY_SAVED, store);
}
export function setTags(id: string, tags: string[]) {
  const store = readKey<SavedStore>(KEY_SAVED, {});
  if (store[id]) { store[id].tags = tags; writeKey(KEY_SAVED, store); }
}
export function updateSavedNote(id: string, note: string) {
  const store = readKey<SavedStore>(KEY_SAVED, {});
  if (store[id]) { store[id].note = note; writeKey(KEY_SAVED, store); }
}
export function removeSaved(id: string) {
  const store = readKey<SavedStore>(KEY_SAVED, {});
  delete store[id];
  writeKey(KEY_SAVED, store);
}
export function useSaved() {
  const store = useStore<SavedStore>(KEY_SAVED, {});
  const items = Object.values(store).sort((a, b) => b.savedAt - a.savedAt);
  const ids = new Set(Object.keys(store));
  const allTags = Array.from(new Set(items.flatMap((i) => i.tags))).sort();
  return { items, ids, allTags };
}

/* ---------------- highlights (excerpts + annotations) ---------------- */
export type Highlight = {
  id: string;
  signalId: string;
  signalHeading: string;
  signalDate: string;
  source: string;
  sourceId: string;
  postUrl: string;
  text: string;
  note: string;
  tags: string[];
  createdAt: number;
};
type HiStore = Record<string, Highlight>;
const KEY_HI = "jotter.highlights.v1";

export function addHighlight(
  h: Omit<Highlight, "id" | "note" | "tags" | "createdAt"> & { tags?: string[] }
) {
  const store = readKey<HiStore>(KEY_HI, {});
  const id = `${h.signalId}-${Date.now()}`;
  store[id] = { ...h, id, note: "", tags: h.tags ?? [], createdAt: Date.now() };
  writeKey(KEY_HI, store);
  return id;
}
export function updateHighlightNote(id: string, note: string) {
  const store = readKey<HiStore>(KEY_HI, {});
  if (store[id]) { store[id].note = note; writeKey(KEY_HI, store); }
}
export function setHighlightTags(id: string, tags: string[]) {
  const store = readKey<HiStore>(KEY_HI, {});
  if (store[id]) { store[id].tags = tags; writeKey(KEY_HI, store); }
}
export function removeHighlight(id: string) {
  const store = readKey<HiStore>(KEY_HI, {});
  delete store[id];
  writeKey(KEY_HI, store);
}
export function useHighlights() {
  const store = useStore<HiStore>(KEY_HI, {});
  const items = Object.values(store).sort((a, b) => b.createdAt - a.createdAt);
  const allTags = Array.from(new Set(items.flatMap((i) => i.tags))).sort();
  return { items, allTags };
}
