"use client";

import { useState } from "react";
import type { HandoutColumn, HandoutTemplate } from "@/lib/engine/models";
import { defaultHandoutTemplates } from "@/lib/engine/handouts";
import { CUSTOM_PREFIX, FIELD_OPTIONS } from "@/lib/handoutFields";

export interface EditorEvent {
  id: string;
  name: string;
  templates: HandoutTemplate[];
}

export function HandoutTemplateEditor({ slug, events }: { slug: string; events: EditorEvent[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const initialFor = (id: string) => events.find((e) => e.id === id)!.templates;
  const [templates, setTemplates] = useState<HandoutTemplate[]>(() =>
    structuredClone(initialFor(events[0]?.id ?? "")),
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function switchEvent(id: string) {
    setEventId(id);
    setTemplates(structuredClone(initialFor(id)));
    setStatus("idle");
  }

  function update(next: HandoutTemplate[]) {
    setTemplates(next);
    setStatus("idle");
  }

  const editTemplate = (ti: number, patch: Partial<HandoutTemplate>) =>
    update(templates.map((t, i) => (i === ti ? { ...t, ...patch } : t)));

  const editColumn = (ti: number, ci: number, patch: Partial<HandoutColumn>) =>
    editTemplate(ti, { columns: templates[ti].columns.map((c, i) => (i === ci ? { ...c, ...patch } : c)) });

  const moveColumn = (ti: number, ci: number, dir: -1 | 1) => {
    const cols = [...templates[ti].columns];
    const j = ci + dir;
    if (j < 0 || j >= cols.length) return;
    [cols[ci], cols[j]] = [cols[j], cols[ci]];
    editTemplate(ti, { columns: cols });
  };

  const removeColumn = (ti: number, ci: number) =>
    editTemplate(ti, { columns: templates[ti].columns.filter((_, i) => i !== ci) });

  const addColumn = (ti: number) => {
    const opts = FIELD_OPTIONS[templates[ti].kind];
    editTemplate(ti, { columns: [...templates[ti].columns, { header: opts[0].label, source: opts[0].source }] });
  };

  async function save() {
    setStatus("saving");
    try {
      const res = await fetch(`/api/races/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, templates }),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  const input = "rounded border border-border bg-background px-2 py-1 text-sm";

  return (
    <div className="mt-6">
      {events.length > 1 && (
        <div className="mb-4">
          <label className="text-sm font-semibold text-muted">
            Event{" "}
            <select className={`${input} ml-1`} value={eventId} onChange={(e) => switchEvent(e.target.value)}>
              {events.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="space-y-6">
        {templates.map((t, ti) => {
          const opts = FIELD_OPTIONS[t.kind];
          return (
            <section key={t.key} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  className={`${input} font-bold text-foreground`}
                  value={t.title}
                  onChange={(e) => editTemplate(ti, { title: e.target.value })}
                />
                <span className="rounded bg-surface-2 px-2 py-0.5 text-xs uppercase text-muted">{t.kind}</span>
                {t.kind === "roster" && (
                  <>
                    <label className="text-xs text-muted">
                      sort{" "}
                      <select className={input} value={t.sort ?? "name"} onChange={(e) => editTemplate(ti, { sort: e.target.value as HandoutTemplate["sort"] })}>
                        <option value="name">name</option>
                        <option value="wave">wave</option>
                        <option value="category">category</option>
                        <option value="none">none</option>
                      </select>
                    </label>
                    <label className="text-xs text-muted">
                      rows{" "}
                      <select className={input} value={t.filter ?? "all"} onChange={(e) => editTemplate(ti, { filter: e.target.value as HandoutTemplate["filter"] })}>
                        <option value="all">all riders</option>
                        <option value="hasWave">only riders with a wave</option>
                      </select>
                    </label>
                  </>
                )}
              </div>

              <ul className="mt-4 space-y-2">
                {t.columns.map((c, ci) => {
                  const isCustom = c.source.startsWith(CUSTOM_PREFIX);
                  return (
                    <li key={ci} className="flex flex-wrap items-center gap-2">
                      <input
                        className={`${input} w-40`}
                        value={c.header}
                        onChange={(e) => editColumn(ti, ci, { header: e.target.value })}
                        placeholder="Header"
                      />
                      <select
                        className={input}
                        value={isCustom ? "__custom" : c.source}
                        onChange={(e) =>
                          editColumn(ti, ci, {
                            source: e.target.value === "__custom" ? `${CUSTOM_PREFIX}` : (e.target.value as HandoutColumn["source"]),
                          })
                        }
                      >
                        {opts.map((o) => (
                          <option key={o.source} value={o.source}>{o.label}</option>
                        ))}
                        <option value="__custom">Custom field…</option>
                      </select>
                      {isCustom && (
                        <input
                          className={`${input} w-44`}
                          placeholder="Registration field name"
                          value={c.source.slice(CUSTOM_PREFIX.length)}
                          onChange={(e) => editColumn(ti, ci, { source: `${CUSTOM_PREFIX}${e.target.value}` })}
                        />
                      )}
                      <span className="ml-auto flex items-center gap-1">
                        <button onClick={() => moveColumn(ti, ci, -1)} className="px-1 text-muted hover:text-foreground" title="Move up">↑</button>
                        <button onClick={() => moveColumn(ti, ci, 1)} className="px-1 text-muted hover:text-foreground" title="Move down">↓</button>
                        <button onClick={() => removeColumn(ti, ci)} className="px-1 text-muted hover:text-danger" title="Remove">✕</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <button onClick={() => addColumn(ti)} className="mt-3 text-sm font-semibold text-brand-strong hover:underline">
                + Add column
              </button>
            </section>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={save} disabled={status === "saving"} className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-foreground hover:bg-brand-strong disabled:opacity-50">
          {status === "saving" ? "Saving…" : "Save templates"}
        </button>
        <button
          onClick={() => update(structuredClone(defaultHandoutTemplates()))}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Reset to defaults
        </button>
        {status === "saved" && <span className="text-sm text-brand-strong">Saved</span>}
        {status === "error" && <span className="text-sm text-danger">Save failed</span>}
      </div>
    </div>
  );
}
