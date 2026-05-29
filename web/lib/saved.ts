"use client";
import { useEffect, useState } from "react";
import type { Signal } from "./types";

export type SavedItem = { signal: Signal; tags: string[]; savedAt: number };
type Store = Record<string, SavedItem>;

const KEY = "jotter.saved.v1";
const EVT = "jotter-saved-changed";

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function write(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(EVT));
}

export function toggleSave(signal: Signal) {
  const store = read();
  if (store[signal.id]) delete store[signal.id];
  else store[signal.id] = { signal, tags: [], savedAt: Date.now() };
  write(store);
}

export function setTags(id: string, tags: string[]) {
  const store = read();
  if (store[id]) {
    store[id].tags = tags;
    write(store);
  }
}

export function removeSaved(id: string) {
  const store = read();
  delete store[id];
  write(store);
}

/** Reactive: list of saved items, newest first. */
export function useSaved() {
  const [store, setStore] = useState<Store>({});
  useEffect(() => {
    const sync = () => setStore(read());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const items = Object.values(store).sort((a, b) => b.savedAt - a.savedAt);
  const ids = new Set(Object.keys(store));
  const allTags = Array.from(new Set(items.flatMap((i) => i.tags))).sort();
  return { items, ids, allTags };
}
