// src/App.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  db,
  addExercise,
  getExercises,
  createWorkout,
  getWorkoutsByDate,
  addSet,
  getSetsForWorkout,
  getSetsForExercise,
  epley1RM,
  updateSet,
  deleteSet,
  deleteExercise,
  exportAll,
  importAll,
  updateExerciseName,
  updateExerciseTimed,
  getPR,
  updatePRForExercise,
  recalcAllPRs,
  getTemplates,
  getTemplateWithItems,
  addTemplate,
  deleteTemplate,
  addTemplateItem,
  deleteTemplateItem,
  updateTemplateItem,
  // NEW:
  getWorkoutByDate,
  updateWorkoutMeta,
} from "./db";

import { liveQuery } from "dexie";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";



// NEW: Icon wrapper for your custom SVGs (src/components/Icon.jsx)
import Icon from "./components/Icon";

const TABS = ["Log", "Progress", "Exercises", "Templates", "Settings"];

/* ---------- Shared utils ---------- */
function useLiveQueryHook(queryFn, deps = []) {
  const [data, setData] = useState(null);
  useEffect(() => {
    const sub = liveQuery(queryFn).subscribe({
      next: (v) => setData(v),
      error: (err) => console.error(err),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ---------- Toast ---------- */
function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50">
      <div className="rounded-full bg-black text-white px-4 py-2 text-sm shadow-md">
        {message}
      </div>
    </div>
  );
}

/* ---------- NEW: helpers for Log header ---------- */
function formatMMSS(total) {
  if (!Number.isFinite(total) || total <= 0) return "00:00";
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
// Parse "MM:SS" (or "M:SS") into total seconds; returns null on bad input
// Parse "MM:SS" OR compact digits like "2555" => 25:55 (also handles carry like "90" => 1:30)
function parseMMSS(str) {
  if (!str || typeof str !== "string") return null;
  const t = str.trim();

  // Case 1: explicit MM:SS
  if (/^\d{1,3}:[0-5]\d$/.test(t)) {
    const [m, s] = t.split(":");
    return Number(m) * 60 + Number(s);
  }

  // Case 2: compact digits (1–4 digits)
  if (/^\d{1,4}$/.test(t)) {
    // last two digits are seconds, the rest are minutes
    const sec = Number(t.slice(-2));
    const min = Number(t.slice(0, -2) || "0");
    // allow carry if seconds >= 60 (e.g., "90" -> 1:30)
    const total = min * 60 + sec;
    const carryM = Math.floor(total / 60);
    const carryS = total % 60;
    return carryM * 60 + carryS;
  }

  return null; // bad input
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center">
      <div className="w-full max-w-xl bg-zinc-900 text-white rounded-t-2xl sm:rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button
            className="px-3 py-1 rounded bg-zinc-800 border border-white/10"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

const MOOD = [
  { v: 1, id: "mood-1", glyph: "😖", label: "Horrible" },
  { v: 2, id: "mood-2", glyph: "😕", label: "Bad" },
  { v: 3, id: "mood-3", glyph: "😐", label: "Okay" },
  { v: 4, id: "mood-4", glyph: "🙂", label: "Good" },
  { v: 5, id: "mood-5", glyph: "😄", label: "Great" },
];

function MoodPicker({ value = 3, onChange }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {MOOD.map((m) => (
        <button
          key={m.v}
          onClick={() => onChange(m.v)}
          className={`w-9 h-9 grid place-items-center rounded-full border border-white/10 ${
            m.v === value ? "bg-white/10" : "bg-transparent"
          }`}
          aria-label={m.label}
          title={m.label}
        >
          <span className="text-lg leading-none">{m.glyph}</span>
        </button>
      ))}
    </div>
  );
}
function BottomNav({ currentTab, setCurrentTab }) {
  const Item = ({ id, icon, label }) => {
    const active = currentTab === id;
    return (
      <button
        onClick={() => setCurrentTab(id)}
        className="flex flex-col items-center justify-center flex-1 py-2"
        aria-label={label}
        aria-current={active ? "page" : undefined}
      >
        <Icon
          name={icon}
          className={
            "w-7 h-7 " + (active ? "text-white" : "text-white/50")
          }
        />
        {/* If you ever want labels, uncomment: */}
        {/* <span className={"mt-1 text-[11px] " + (active ? "text-white" : "text-white/60")}>{label}</span> */}
      </button>
    );
  };

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-black/90 border-t border-white/10 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
      role="tablist"
    >
      <div className="mx-auto max-w-screen-sm flex">
        <Item id="log"       icon="home"      label="Log" />
        <Item id="progress"  icon="progress"  label="Progress" />
        <Item id="exercises" icon="exercises" label="Exercises" />
        <Item id="templates" icon="grid"      label="Templates" />
        <Item id="settings"  icon="settings"  label="Settings" />
      </div>
    </nav>
  );
}
/* ---------- Main App ---------- */
export default function App() {
  const [tab, setTab] = useState("Log");
  const [toast, setToast] = useState("");

  useEffect(() => {
    recalcAllPRs();
  }, []);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(""), 2200);
  }

 // Replace your current mobile-gate block with this:
const params = new URLSearchParams(window.location.search);
const forceDesktop = params.has("desktop"); // visit with ?desktop=1
const isMobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

if (!forceDesktop && !isMobileUA) {
  return (
    <div className="min-h-[100svh] grid place-items-center p-8 text-center">
      <div>
        <h1 className="text-2xl font-bold">Open on your phone 📱</h1>
        <p className="text-gray-600 mt-2">
          This app is optimized for mobile screens.
        </p>
      </div>
    </div>
  );
}

  const NAV = [
    { id: "Log",       icon: "home",      label: "Log" },
    { id: "Progress",  icon: "progress",  label: "Progress" },
    { id: "Exercises", icon: "exercises", label: "Exercises" },
    { id: "Templates", icon: "grid",      label: "Templates" },
    { id: "Settings",  icon: "settings",  label: "Settings" },
  ];

  return (
   <div className="min-h-[100dvh] max-w-xl mx-auto px-4 bg-black text-white">
  {/* top notch spacer */}
  <div style={{ height: 'var(--safe-top)' }} />
      <h1 className="text-2xl font-bold sr-only">Repped</h1>

      {/* Content gets EXACT padding for the nav (64px) + iOS safe area */}
      <div className="mt-1 pb-[calc(56px+env(safe-area-inset-bottom))]">
        {tab === "Log" && (
          <LogTab useLiveQuery={useLiveQueryHook} showToast={showToast} />
        )}
        {tab === "Progress" && (
          <ProgressTab useLiveQuery={useLiveQueryHook} />
        )}
        {tab === "Exercises" && (
          <ExercisesTab useLiveQuery={useLiveQueryHook} />
        )}
        {tab === "Templates" && (
          <TemplatesTab useLiveQuery={useLiveQueryHook} />
        )}
        {tab === "Settings" && <SettingsTab />}
      </div>

      <Toast message={toast} />

      {/* Fixed bottom nav: exact height 64px + safe area padding */}
     <nav
  className="fixed bottom-0 inset-x-0 z-40 bg-black border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
>
  {/* Toolbar row: exactly 56px tall */}
  <div className="mx-auto max-w-xl h-14 flex items-center justify-between">
    {NAV.map(({ id, icon, label }) => {
      const active = tab === id;
      return (
        <button
          key={id}
          onClick={() => setTab(id)}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          className="flex-1 flex items-center justify-center"
        >
          <Icon
            name={icon}
            className={`w-7 h-7 ${active ? 'text-white' : 'text-white/50'}`}
          />
        </button>
      );
    })}
  </div>
</nav>
    </div>
  );
}

/* ---------- Exercises Tab (Step 1: new layout) ---------- */
function ExercisesTab({ useLiveQuery }) {
  const exercises = useLiveQuery(getExercises, []); // live Dexie feed
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Simple live filter (name only for now)
  const list = (exercises ?? []).filter(ex =>
    ex.name.toLowerCase().includes(query.toLowerCase())
  );

  async function onDeleteExercise(id, label) {
    if (!window.confirm(`Delete "${label}"?`)) return;
    await deleteExercise(id);
  }

  return (
    <div className="pb-24"> {/* space for bottom nav */}
      {/* Safe top gap already handled globally; this is the page header */}
      <div className="pt-[max(env(safe-area-inset-top),1rem)] pb-3 sticky top-0 bg-transparent z-10">
        <div className="grid grid-cols-3 items-center">
          {/* Left spacer to keep title perfectly centered */}
          <div className="h-8" />

          {/* Centered title */}
          <div className="text-center">
            <div className="font-gotham-light uppercase tracking-[0.18em] text-[22px] text-white/80">EXERCISES</div>
          </div>

          {/* Right: search icon */}
          <div className="flex justify-end">
            <button
              aria-label="Search"
              onClick={() => setSearchOpen(true)}
              className="p-2 active:opacity-80"
            >
              <Icon name="search" className="w-6 h-6 text-white/80" />
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <ul className="mt-1 space-y-1.5">
        {list.map((ex) => (
          <SwipeRow key={ex.id} onDelete={() => onDeleteExercise(ex.id, ex.name)}>
            <button
              onClick={() => {/* Step 2: open overlay sheet here */}}
              className="w-full text-left rounded-2xl bg-[#151515] px-4 py-2 active:scale-[0.99] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium text-[15px] truncate">{ex.name}</div>
                  <div className="text-[11px] text-white/60 mt-0.5">
                    {ex.type === "weighted" ? "Free weight / Machine" : "Bodyweight"}
                  </div>
                </div>
                <Icon name="chevron-right" className="w-5 h-5 text-white/70 shrink-0" />
              </div>
            </button>
          </SwipeRow>
        ))}
        {list.length === 0 && (
          <li className="text-center text-white/60 text-sm mt-6">No exercises yet.</li>
        )}
      </ul>

      {/* Floating + button */}
      <button
        onClick={() => setCreateOpen(true)}
        aria-label="Add Exercise"
        className="fixed left-1/2 -translate-x-1/2 z-50 grid place-items-center w-12 h-12 rounded-full bg-white text-black shadow-xl border border-white/20 active:scale-95"
        style={{ bottom: 'calc(56px + env(safe-area-inset-bottom) + 16px)' }}
      >
        <Icon name="plus" className="w-7 h-7 text-black" />
      </button>

      {/* Create Exercise modal (reuses your existing add flow) */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Exercise">
        <CreateExerciseForm onDone={() => setCreateOpen(false)} />
      </Modal>
      {/* Search modal */}
      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="Search">
        <div className="h-11 rounded-full bg-white/5 flex items-center px-3 gap-2">
          <Icon name="search" className="w-5 h-5 text-white/70" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises…"
            className="bg-transparent outline-none w-full text-sm placeholder-white/40"
          />
        </div>
      </Modal>
    </div>
  );
}

/* Small, contained form that uses your existing addExercise() API */
function CreateExerciseForm({ onDone }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("weighted");
  const [isTimed, setIsTimed] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (!name.trim()) return;
      await addExercise({ name: name.trim(), type, isTimed }); // existing DB API
      onDone?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <input
        className="h-12 border rounded bg-zinc-800 border-white/10 px-3"
        placeholder="Exercise name (e.g., Lat Pulldown)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          className="h-12 border rounded bg-zinc-800 border-white/10 px-3"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="weighted">Weighted</option>
          <option value="bodyweight">Bodyweight</option>
        </select>
        <label className="h-12 border rounded bg-zinc-800 border-white/10 px-3 flex items-center gap-2">
          <input type="checkbox" checked={isTimed} onChange={(e) => setIsTimed(e.target.checked)} />
          Timed
        </label>
      </div>
      <button className="min-h-[44px] px-4 rounded bg-white text-black font-semibold">Create</button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
/* ---------- Templates Tab ---------- */
function TemplatesTab({ useLiveQuery }) {
  const templates = useLiveQuery(getTemplates, []);
  const exercises = useLiveQuery(getExercises, []);
  const [name, setName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [setsInputs, setSetsInputs] = useState({});

  async function handleAddTemplate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const id = await addTemplate(name.trim());
    setName("");
    setSelectedTemplate(id);
  }

  async function handleDeleteTemplate(id) {
    if (!window.confirm("Delete this template?")) return;
    await deleteTemplate(id);
    if (selectedTemplate === id) setSelectedTemplate(null);
  }

  async function handleAddExerciseToTemplate(exId) {
    if (!selectedTemplate) return;
    await addTemplateItem(selectedTemplate, exId);
  }

  const currentTemplate = useLiveQuery(
    () =>
      selectedTemplate
        ? getTemplateWithItems(selectedTemplate)
        : Promise.resolve(null),
    [selectedTemplate]
  );

  // Sync input state when template items change
  useEffect(() => {
    if (!currentTemplate?.items) return;
    const next = {};
    for (const it of currentTemplate.items) {
      next[it.id] = String(it.defaultSets ?? 1);
    }
    setSetsInputs(next);
  }, [currentTemplate?.items]);

  function onSetsChange(itemId, val) {
    if (!/^\d*$/.test(val)) return;
    setSetsInputs((prev) => ({ ...prev, [itemId]: val }));
  }

  function onSetsBlur(itemId) {
    const raw = setsInputs[itemId];
    const parsed = parseInt(raw, 10);
    const clamped = Number.isFinite(parsed)
      ? Math.max(1, Math.min(parsed, 20))
      : 1;
    setSetsInputs((prev) => ({ ...prev, [itemId]: String(clamped) }));
    updateTemplateItem(itemId, { defaultSets: clamped });
  }

  return (
    <div className="overflow-x-hidden">
      <h2 className="font-semibold">Workout Templates</h2>

      {/* Create template */}
      <form onSubmit={handleAddTemplate} className="mt-3 flex gap-2">
        <input
          className="flex-1 h-10 border rounded px-3 bg-zinc-900 border-zinc-800"
          placeholder="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="bg-white text-black px-4 rounded">Add</button>
      </form>

      {/* List templates */}
      <ul className="mt-4 space-y-2">
        {(templates ?? []).map((t) => (
          <li
            key={t.id}
            className={`border border-zinc-800 rounded p-2 bg-zinc-900 ${
              selectedTemplate === t.id ? "ring-1 ring-white/20" : ""
            }`}
            onClick={() => setSelectedTemplate(t.id)}
          >
            <div className="flex justify-between items-center">
              <span className="font-medium">{t.name}</span>
              <button
                className="text-xs text-white/60"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteTemplate(t.id);
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
        {templates?.length === 0 && (
          <p className="text-white/60 text-sm">
            No templates yet — create one above.
          </p>
        )}
      </ul>

      {/* Template detail */}
      {currentTemplate?.template && (
        <div className="mt-4 border-t border-zinc-800 pt-3">
          <h3 className="font-semibold">
            {currentTemplate.template.name} Exercises
          </h3>

          {/* Add exercise selector */}
          <div className="mt-2">
            <select
              className="w-full h-10 border rounded px-3 bg-zinc-900 border-zinc-800"
              onChange={(e) => {
                const exId = Number(e.target.value);
                if (exId) handleAddExerciseToTemplate(exId);
                e.target.value = "";
              }}
              defaultValue=""
            >
              <option value="">Add Exercise...</option>
              {(exercises ?? []).map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
          </div>

          {/* Editable defaults for each exercise in the template */}
          <ul className="mt-3 space-y-2">
            {(currentTemplate.items ?? []).map((it) => {
              const ex = exercises?.find((e) => e.id === it.exerciseId);
              const isTimed = !!ex?.isTimed;
              const isWeighted = ex?.type === "weighted";
              return (
                <li key={it.id} className="border border-zinc-800 rounded p-2 text-sm bg-zinc-900">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="font-medium break-words">
                        {ex?.name ?? "Unknown Exercise"}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-white/70">
                          {ex?.type}
                          {isTimed ? " · timed" : ""}
                        </span>
                      </div>
                    </div>
                    <button
                      className="text-xs text-white/60 shrink-0"
                      onClick={() => deleteTemplateItem(it.id)}
                    >
                      Remove
                    </button>
                  </div>

                  {/* defaults editor */}
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-white/60">
                        Sets
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="w-full h-9 border rounded px-2 bg-zinc-900 border-zinc-800"
                        value={setsInputs[it.id] ?? String(it.defaultSets ?? 1)}
                        onChange={(e) => onSetsChange(it.id, e.target.value)}
                        onBlur={() => onSetsBlur(it.id)}
                        placeholder="Sets"
                      />
                    </div>

                    {!isTimed && (
                      <div>
                        <label className="block text-[11px] text-white/60">
                          Reps
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={200}
                          className="w-full h-9 border rounded px-2 bg-zinc-900 border-zinc-800"
                          value={it.defaultReps ?? ""}
                          onChange={(e) =>
                            updateTemplateItem(it.id, {
                              defaultReps:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    )}

                    {isTimed && (
                      <div>
                        <label className="block text-[11px] text-white/60">
                          Duration (sec)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={3600}
                          className="w-full h-9 border rounded px-2 bg-zinc-900 border-zinc-800"
                          value={it.defaultDurationSec ?? ""}
                          onChange={(e) =>
                            updateTemplateItem(it.id, {
                              defaultDurationSec:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    )}

                    {isWeighted && (
                      <div>
                        <label className="block text-[11px] text-white/60">
                          Weight (kg)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          className="w-full h-9 border rounded px-2 bg-zinc-900 border-zinc-800"
                          value={it.defaultWeightKg ?? ""}
                          onChange={(e) =>
                            updateTemplateItem(it.id, {
                              defaultWeightKg:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
            {currentTemplate.items?.length === 0 && (
              <p className="text-white/60 text-sm">No exercises yet.</p>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------- Swipeable Row (Step 2: delete threshold + reveal background) ----------
function SwipeRow({ children, onDelete }) {
  const [dx, setDx] = useState(0);           // current horizontal offset
  const [anim, setAnim] = useState(false);   // animate on release
  const start = useRef({ x: 0, y: 0, active: false, locked: false }); // gesture state
  const THRESH = 96; // px you must exceed (to the left) to delete

  function isFormControl(el) {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    return tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button';
  }

  const onPointerDown = (e) => {
    // Ignore drags that start on form controls (so editing inputs won't swipe)
    if (isFormControl(e.target)) return;
    const tgt = e.currentTarget;
    try { tgt.setPointerCapture(e.pointerId); } catch {}
    start.current = { x: e.clientX, y: e.clientY, active: true, locked: false };
    setAnim(false);
  };

  const onPointerMove = (e) => {
    if (!start.current.active) return;

    const dxNow = e.clientX - start.current.x;
    const dyNow = e.clientY - start.current.y;

    // Angle guard and dead zone
    if (!start.current.locked) {
      if (Math.abs(dyNow) > 8 && Math.abs(dyNow) > Math.abs(dxNow)) {
        // vertical scroll - abort swipe
        start.current.active = false;
        setAnim(true);
        setDx(0);
        return;
      }
      if (Math.abs(dxNow) > 8 && Math.abs(dxNow) > Math.abs(dyNow) * 1.2) {
        start.current.locked = true;
      } else {
        return; // not yet considered a horizontal swipe
      }
    }

    // Only allow swiping to the left (negative)
    const next = Math.min(0, dxNow);
    setDx(next);
  };

  const onPointerUp = () => {
    const commitDelete = dx <= -THRESH;
    start.current.active = false;
    start.current.locked = false;

    if (commitDelete) {
      // slide out and then call onDelete
      setAnim(true);
      // move far left for a nice dismiss
      setDx(-window.innerWidth);
      setTimeout(() => {
        try {
          onDelete && onDelete();
        } finally {
          // reset position in case the row re-renders in place
          setDx(0);
          setAnim(false);
        }
      }, 160);
    } else {
      // snap back
      setAnim(true);
      setDx(0);
    }
  };

  // progress (0..1) for background reveal
  const p = Math.min(1, Math.max(0, -dx / THRESH));

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Background layer (reveals as you drag left) */}
      <div
        className="absolute inset-0 flex items-center justify-end pr-4 select-none"
        style={{
          backgroundColor: `rgba(220, 38, 38, ${0.1 + 0.35 * p})`, // red-600-ish with fade
          pointerEvents: 'none',
        }}
      >
        <div
          className="text-white font-medium"
          style={{ opacity: 0.35 + 0.65 * p, transform: `translateX(${(-8 + 8 * (1 - p))}px)` }}
        >
          Delete
        </div>
      </div>

      {/* Foreground card */}
      <div
        className="rounded-2xl touch-pan-y select-none"
        style={{
          transform: `translateX(${dx}px)`,
          transition: anim ? 'transform 200ms ease' : 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------- Log Tab (center + button opens Quick Add modal) ---------- */
function LogTab({ useLiveQuery, showToast }) {
  const exercises = useLiveQuery(getExercises, []);
  const templates = useLiveQuery(getTemplates, []);
  const [selectedDate, setSelectedDate] = useState(todayISO());

  // Workout & Sets
  const workouts = useLiveQuery(() => getWorkoutsByDate(selectedDate), [selectedDate]);
  const workout = workouts?.[0] ?? null;
  const workoutId = workout?.id;
  const sets = useLiveQuery(
    () => (workoutId ? getSetsForWorkout(workoutId) : Promise.resolve([])),
    [workoutId]
  );

  const [expanded, setExpanded] = useState({});

  // Quick Add Exercise state (used inside modal)
  const [qaExerciseId, setQaExerciseId] = useState("");
  const qaExercise = (exercises ?? []).find((e) => String(e.id) === String(qaExerciseId));
  const qaIsTimed = !!qaExercise?.isTimed;
  const qaIsWeighted = qaExercise?.type === "weighted";

  const [qaNumSets, setQaNumSets] = useState(3);
  const [qaNumSetsInput, setQaNumSetsInput] = useState("3");
  function commitQaNumSets() {
    const parsed = parseInt(qaNumSetsInput, 10);
    const clamped = Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 20)) : 1;
    setQaNumSets(clamped);
    setQaNumSetsInput(String(clamped));
  }
  function bumpQaNumSets(delta) {
    const base = parseInt(qaNumSetsInput, 10);
    const next = Number.isFinite(base) ? base + delta : delta > 0 ? 1 : 1;
    const clamped = Math.max(1, Math.min(next, 20));
    setQaNumSets(clamped);
    setQaNumSetsInput(String(clamped));
  }

  const [qaReps, setQaReps] = useState("");
  const [qaDuration, setQaDuration] = useState("");
  const [qaWeight, setQaWeight] = useState("");

  function toggleExpanded(exId) {
    setExpanded((prev) => ({ ...prev, [exId]: !prev[exId] }));
  }

  // Header / Modals
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);               // ⬅️ NEW: Quick Add modal
  const [moodOpen, setMoodOpen] = useState(false);             // Mood picker modal state
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(workout?.title ?? "");
  useEffect(() => {
    setTitleDraft(workout?.title ?? "");
    setTitleEditing(false);
  }, [workout?.id]);

  // Timer logic
  // Manual duration editing (MM:SS)
  const [durationEditing, setDurationEditing] = useState(false);
  const [durationDraft, setDurationDraft] = useState("00:00");

  // Keep the draft synced with DB value
  useEffect(() => {
    const sec = Number(workout?.durationSec ?? 0);
    setDurationDraft(formatMMSS(sec));
  }, [workout?.id, workout?.durationSec]);

  // Ensure a workout exists for this date
  async function ensureWorkout() {
    if (workoutId) return workoutId;
    return await createWorkout(selectedDate);
  }

  async function saveDuration() {
    const wid = await ensureWorkout();
    const parsed = parseMMSS(durationDraft);
    const sec = parsed == null ? 0 : Math.max(0, Math.min(parsed, 24 * 60 * 60)); // clamp to 24h
    await updateWorkoutMeta(wid, { durationSec: sec, startAt: null, endAt: null });
    setDurationEditing(false);
  }
  async function setMood(v) {
    const wid = await ensureWorkout();
    await updateWorkoutMeta(wid, { mood: v });
  }
  async function saveTitle() {
    const name = titleDraft.trim();
    if (!name) return setTitleEditing(false);
    const wid = await ensureWorkout();
    await updateWorkoutMeta(wid, { title: name });
    setTitleEditing(false);
  }

  // Sets CRUD
  async function handleUpdateSet(id, field, value) {
    const patch = { [field]: value === "" ? null : Number(value) };
    const exId = await updateSet(id, patch);
    if (exId) await updatePRForExercise(exId);
  }
  async function handleDeleteSet(id) {
    if (!window.confirm("Delete this set?")) return;
    const exId = await deleteSet(id);
    if (exId) await updatePRForExercise(exId);
  }
  async function handleDeleteExercise(exId) {
    if (!window.confirm("Delete all sets for this exercise?")) return;
    const del = (sets ?? []).filter((s) => s.exerciseId === exId);
    for (const s of del) await deleteSet(s.id);
    await updatePRForExercise(exId);
    showToast("Exercise removed");
  }
  async function handleAddSet(exId) {
    const exercise = exercises?.find((e) => e.id === Number(exId));
    if (!exercise) return;
    const wid = workoutId || (await createWorkout(selectedDate));
    const isTimed = !!exercise.isTimed;
    const isWeighted = exercise.type === "weighted";
    const currentMax =
      Math.max(0, ...((sets ?? []).filter((s) => s.exerciseId === Number(exId)).map((s) => s.setIndex || 0))) || 0;
    await addSet({
      workoutId: wid,
      exerciseId: Number(exId),
      setIndex: currentMax + 1,
      reps: isTimed ? null : 0,
      durationSec: isTimed ? 0 : null,
      weightKg: isWeighted ? null : null,
    });
    showToast("Set added");
  }

  // Quick Add -> used in modal
  async function handleQuickAdd(e) {
    e.preventDefault();
    if (!qaExerciseId) return;

    const exId = Number(qaExerciseId);
    const ex = (exercises ?? []).find((x) => x.id === exId);
    if (!ex) return;

    const wid = workoutId || (await createWorkout(selectedDate));

    const currentMax =
      Math.max(0, ...((sets ?? []).filter((s) => s.exerciseId === exId).map((s) => s.setIndex || 0))) || 0;

    const count = Math.max(1, Math.min(Number(qaNumSets) || 1, 20));
    for (let i = 0; i < count; i++) {
      await addSet({
        workoutId: wid,
        exerciseId: exId,
        setIndex: currentMax + i + 1,
        reps: ex.isTimed ? null : (qaReps === "" ? null : Number(qaReps)),
        durationSec: ex.isTimed ? (qaDuration === "" ? null : Number(qaDuration)) : null,
        weightKg: ex.type === "weighted" ? (qaWeight === "" ? null : Number(qaWeight)) : null,
      });
    }

    await updatePRForExercise(exId);
    showToast(`${count} set${count > 1 ? "s" : ""} added to ${ex.name}`);

    // reset & close
    setQaReps(""); setQaDuration(""); setQaWeight(""); setAddOpen(false);
  }

  // Derived
  const groupedSets = useMemo(() => {
    const grouped = {};
    (sets ?? []).forEach((s) => {
      if (!grouped[s.exerciseId]) grouped[s.exerciseId] = [];
      grouped[s.exerciseId].push(s);
    });
    return grouped;
  }, [sets]);
  const exerciseCount = Object.keys(groupedSets).length;
  const durationSec = Number(workout?.durationSec ?? 0);
const durationText = formatMMSS(durationSec);
  const moodValue = Number(workout?.mood ?? 3);
  const moodFace = MOOD.find(m => m.v === moodValue)?.glyph ?? "😐";

  return (

    <div className="text-white">
      {/* HEADER */}
      <div className="sticky top-0 bg-black safe-top pb-3">
        {/* Top bar: left icon, centered date, right spacer to keep perfect centering */}
        <div className="pt-2 grid grid-cols-3 items-center">
          {/* Left: Templates */}
          <div className="flex justify-start">
            <button
              onClick={() => setTemplatesOpen(true)}
              className="p-2"
              aria-label="Templates"
            >
              <Icon name="templates" className="w-7 h-7 text-white" />
            </button>
          </div>

          {/* Center: Date (press to open calendar) */}
         <div className="flex justify-center">
 <button
  onClick={() => setCalendarOpen(true)}
  className="font-gotham italic text-base font-semibold uppercase tracking-wide active:opacity-80"
  aria-label="Change date"
  title="Change date"
>
  {new Date(selectedDate)
    .toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
    .toUpperCase()}
</button>
</div>

          {/* Right: spacer with same width as left button to keep the date visually centered */}
          <div className="flex justify-end">
            <span className="p-2 opacity-0">
              <Icon name="templates" className="w-7 h-7" />
            </span>
          </div>
        </div>

        {/* Big title (separate from the date) */}
        <div className="mt-6 text-center">
          {!titleEditing ? (
       <button
  className="font-gotham text-4xl font-normal tracking-tight active:opacity-90"
  onClick={() => setTitleEditing(true)}
>
  {(workout?.title || "WORKOUT").toUpperCase()}
</button>
          ) : (
            <input
              autoFocus
              className="bg-transparent border-b border-white/30 text-4xl font-extrabold text-center outline-none"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === "Enter" && saveTitle()}
              placeholder="Name your workout"
            />
          )}
        </div>
        {/* Stats row (Exercises | Mood | Duration) */}

<div className="mt-8 grid grid-cols-3 items-center text-center">
  {/* Exercises count */}
 <div>
  <div className="font-gotham italic font-extralight text-2xl">{exerciseCount}</div>
  <div className="text-xs text-white/60">Exercises</div>
</div>

  {/* Mood */}
  <div>
    <button
      onClick={() => setMoodOpen(true)}
      className="text-2xl active:opacity-80"
      aria-label="Edit mood"
      title="Edit mood"
    >
      <Icon name={MOOD.find(m => m.v === moodValue)?.id} className="w-7 h-7 text-white" />
    </button>
    <div className="text-xs text-white/60">Mood</div>
  </div>

  {/* Duration (tap to edit MM:SS) */}
  <div>
    {!durationEditing ? (
     <button
  className="font-gotham italic font-extralight text-2xl active:opacity-80"
  onClick={() => setDurationEditing(true)}
  aria-label="Edit duration"
  title="Edit duration"
>
  {durationText}
</button>
    ) : (
      <input
  autoFocus
  inputMode="numeric"
  pattern="^(\d{1,4}|\d{1,3}:[0-5]\d)$"
  maxLength={5}
  placeholder="MM:SS"
  className="font-gotham italic font-extralight text-2xl bg-transparent border-b border-white/30 text-center outline-none w-[88px]"
  value={durationDraft}
  onChange={(e) => setDurationDraft(e.target.value.replace(/[^\d:]/g, ""))}
  onBlur={saveDuration}
  onKeyDown={(e) => {
    if (e.key === "Enter") saveDuration();
    if (e.key === "Escape") {
      setDurationEditing(false);
      setDurationDraft(formatMMSS(Number(workout?.durationSec ?? 0)));
    }
  }}
/>
    )}
    <div className="text-xs text-white/60">Duration</div>
  </div>
</div>
      </div>

      {/* Floating Add Exercise button (bottom-center, above nav) */}
      <button
        onClick={() => setAddOpen(true)}
        aria-label="Add Exercise"
        className="fixed left-1/2 -translate-x-1/2 z-50 grid place-items-center w-10 h-10 rounded-full bg-white text-black shadow-xl border border-white/20 active:scale-95"
        style={{ bottom: 'calc(56px + env(safe-area-inset-bottom) + 16px)' }} // nav(56px) + safe-area + gap
      >
        <Icon name="plus" className="w-7 h-7 text-black" />
      </button>

      {/* Grouped exercises (unchanged) */}
      <div className="mt-4 space-y-3">
        {Object.entries(groupedSets).map(([exId, exSets]) => {
          const exercise = exercises?.find((e) => e.id === Number(exId));
          if (!exercise) return null;
          const isTimed = !!exercise.isTimed;
          const isWeighted = exercise.type === "weighted";

          const repsList = exSets.map((s) => s.reps).filter((r) => r != null);
          const durList = exSets.map((s) => s.durationSec).filter((r) => r != null);
          const wList = exSets.map((s) => s.weightKg).filter((r) => r != null);
          const uniformReps = repsList.length && repsList.every((v) => v === repsList[0]) ? repsList[0] : null;
          const uniformDur = durList.length && durList.every((v) => v === durList[0]) ? durList[0] : null;
          const uniformW = wList.length && wList.every((v) => v === wList[0]) ? wList[0] : null;

          const summary =
            isTimed && uniformDur ? `${exSets.length} × ${formatDuration(uniformDur)}`
            : !isTimed && uniformReps ? `${exSets.length} × ${uniformReps}`
            : `${exSets.length} sets`;
          const suffix = isWeighted && uniformW != null ? ` @ ${uniformW} kg` : "";

          return (
            <SwipeRow key={exId} onDelete={() => handleDeleteExercise(Number(exId))}>
              <div className="rounded-xl bg-[#343434]">
                <div className="flex justify-between items-center p-3">
                  <div onClick={() => toggleExpanded(exId)} className="flex-1 text-left">
                    <div className="font-medium">{exercise.name}</div>
                    <div className="text-sm text-white/60">{summary}{suffix}</div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => toggleExpanded(exId)}
                      aria-label={expanded[exId] ? "Collapse" : "Expand"}
                      aria-expanded={!!expanded[exId]}
                      className="p-2"
                    >
                      <Icon
                        name={expanded[exId] ? "chevron-up" : "chevron-down"}
                        className="w-5 h-5 text-white"
                      />
                    </button>
                  </div>
                </div>

                {expanded[exId] && (
                  <div className="border-t border-zinc-800 px-3 pb-3">
                    <table className="w-full text-sm mt-2">
                      <thead>
                        <tr className="text-white/60 border-b border-zinc-800">
                          <th className="text-left w-10 py-1">#</th>
                          {!isTimed && <th>Reps</th>}
                          {isTimed && <th>Time (s)</th>}
                          {isWeighted && <th>Weight (kg)</th>}
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {exSets.sort((a, b) => a.setIndex - b.setIndex).map((s, idx) => (
                          <tr key={s.id} className="border-b border-zinc-800 last:border-0">
                            <td className="py-1">{idx + 1}</td>
                            {!isTimed && (
                              <td>
                                <input
                                  type="number"
                                  className="w-20 border rounded px-1 text-center bg-zinc-800 border-zinc-700"
                                  value={s.reps ?? ""}
                                  onChange={(e) => handleUpdateSet(s.id, "reps", e.target.value)}
                                />
                              </td>
                            )}
                            {isTimed && (
                              <td>
                                <input
                                  type="number"
                                  className="w-20 border rounded px-1 text-center bg-zinc-800 border-zinc-700"
                                  value={s.durationSec ?? ""}
                                  onChange={(e) => handleUpdateSet(s.id, "durationSec", e.target.value)}
                                />
                              </td>
                            )}
                            {isWeighted && (
                              <td>
                                <input
                                  type="number"
                                  step="0.5"
                                  className="w-20 border rounded px-1 text-center bg-zinc-800 border-zinc-700"
                                  value={s.weightKg ?? ""}
                                  onChange={(e) => handleUpdateSet(s.id, "weightKg", e.target.value)}
                                />
                              </td>
                            )}
                            <td className="text-right">
                              <button className="text-xs text-white/60" onClick={() => handleDeleteSet(s.id)}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Footer add-set row */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Add set"
                      className="mt-2 h-12 -mx-3 px-3 grid place-items-center border-t border-white/10 rounded-b-xl active:scale-[0.99] select-none"
                      onClick={() => handleAddSet(exId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleAddSet(exId);
                        }
                      }}
                    >
                      <Icon name="plus" className="w-6 h-6 text-white" />
                    </div>
                  </div>
                )}
              </div>
            </SwipeRow>
          );
        })}
        {(!sets || sets.length === 0) && (
          <p className="text-white/60 text-sm text-center mt-6">
            No exercises logged for this date yet.
          </p>
        )}
      </div>

      {/* Calendar modal */}
      <Modal open={calendarOpen} onClose={() => setCalendarOpen(false)} title="Pick a date">
        <input
          type="date"
          className="w-full h-12 rounded bg-zinc-800 border border-white/10 px-3"
          value={selectedDate}
          onChange={(e) => { setSelectedDate(e.target.value); setCalendarOpen(false); }}
        />
        {!workout && (
          <p className="mt-3 text-sm text-white/60">
            No workout yet for this date. Load a template or add an exercise.
          </p>
        )}
      </Modal>

      {/* Templates modal */}
      <Modal open={templatesOpen} onClose={() => setTemplatesOpen(false)} title="Load a template">
        <select
          className="w-full h-12 rounded bg-zinc-800 border border-white/10 px-3"
          onChange={async (e) => {
            const id = Number(e.target.value);
            if (!id) return;
            const data = await getTemplateWithItems(id);
            if (!data?.items?.length) return alert("This template has no exercises.");

            const wid = await ensureWorkout();
            for (const item of data.items) {
              const count = Math.max(1, item.defaultSets ?? 1);
              const ex = (exercises ?? []).find((x) => x.id === item.exerciseId);
              const isTimed = !!ex?.isTimed;
              const isWeighted = ex?.type === "weighted";
              const currentMax =
                Math.max(0, ...((sets ?? []).filter((s) => s.exerciseId === item.exerciseId).map((s) => s.setIndex || 0))) || 0;

              for (let i = 0; i < count; i++) {
                await addSet({
                  workoutId: wid,
                  exerciseId: item.exerciseId,
                  setIndex: currentMax + i + 1,
                  reps: isTimed ? null : item.defaultReps ?? null,
                  weightKg: isWeighted ? item.defaultWeightKg ?? null : null,
                  durationSec: isTimed ? item.defaultDurationSec ?? null : null,
                });
              }
            }
            showToast(`Loaded template: ${data.template.name}`);
            setTemplatesOpen(false);
          }}
          defaultValue=""
        >
          <option value="">Select Template...</option>
          {(templates ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
      </Modal>

      {/* Add Exercise modal (Quick Add form moved here) */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Exercise">
        <form onSubmit={handleQuickAdd} className="grid gap-3">
          <select
            className="h-12 border rounded bg-zinc-800 border-white/10 px-3"
            value={qaExerciseId}
            onChange={(e) => setQaExerciseId(e.target.value)}
          >
            <option value="">Select exercise…</option>
            {(exercises ?? []).map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <label className="text-sm text-white/70">Sets</label>
            <button type="button" className="h-10 w-10 border rounded border-white/10" onClick={() => bumpQaNumSets(-1)}>–</button>
            <input
              type="text" inputMode="numeric" pattern="[0-9]*"
              className="h-10 w-20 border rounded px-2 text-center bg-zinc-800 border-white/10"
              value={qaNumSetsInput} onChange={(e) => setQaNumSetsInput(e.target.value)} onBlur={commitQaNumSets}
            />
            <button type="button" className="h-10 w-10 border rounded border-white/10" onClick={() => bumpQaNumSets(1)}>+</button>
          </div>

          {qaExerciseId && !qaIsTimed && (
            <input type="number" className="h-10 border rounded px-3 bg-zinc-800 border-white/10" placeholder="Reps (optional)" value={qaReps} onChange={(e) => setQaReps(e.target.value)} />
          )}
          {qaExerciseId && qaIsTimed && (
            <input type="number" className="h-10 border rounded px-3 bg-zinc-800 border-white/10" placeholder="Duration in seconds (optional)" value={qaDuration} onChange={(e) => setQaDuration(e.target.value)} />
          )}
          {qaExerciseId && qaIsWeighted && (
            <input type="number" step="0.5" className="h-10 border rounded px-3 bg-zinc-800 border-white/10" placeholder="Weight (kg, optional)" value={qaWeight} onChange={(e) => setQaWeight(e.target.value)} />
          )}

          <button className="min-h-[44px] px-4 rounded bg-white text-black font-semibold">
            Add to Workout
          </button>
        </form>
      </Modal>

      {/* Mood picker modal (uses emojis for now; swap to SVGs later) */}
      <Modal open={moodOpen} onClose={() => setMoodOpen(false)} title="How did it feel?">
        <div className="mt-1 grid grid-cols-5 gap-2 place-items-center">
          {MOOD.map((m) => (
            <button
              key={m.v}
              onClick={async () => {
                await setMood(m.v);
                setMoodOpen(false);
              }}
              className={`w-12 h-12 grid place-items-center rounded-full border ${
                m.v === moodValue ? "bg-white/10 border-white/30" : "bg-zinc-900 border-white/10"
              }`}
              aria-label={m.label}
              title={m.label}
            >
             <Icon name={m.id} className="w-7 h-7 text-white" />
            </button>
          ))}
        </div>
        <div className="mt-3 text-center text-xs text-white/60">
          Tap a face to set your mood.
        </div>
      </Modal>
    </div>
  );
}


/* ---------- Progress Tab (shows PR summary) ---------- */
function ProgressTab({ useLiveQuery }) {
  const exercises = useLiveQuery(getExercises, []);
  const [exerciseId, setExerciseId] = useState("");
  const [metric, setMetric] = useState("maxWeight");
  const [points, setPoints] = useState([]);
  const [pr, setPr] = useState(null);

  const selectedExercise = (exercises ?? []).find(
    (e) => String(e.id) === String(exerciseId)
  );
  const isTimed = !!selectedExercise?.isTimed;

  useEffect(() => {
    (async () => {
      if (!exerciseId) {
        setPoints([]);
        setPr(null);
        return;
      }
      const all = await getSetsForExercise(Number(exerciseId));

      const workoutsById = {};
      await db.workouts
        .bulkGet([...new Set(all.map((s) => s.workoutId))])
        .then((arr) => {
          arr.forEach((w) => {
            if (w) workoutsById[w.id] = w;
          });
        });

      const byDate = {};
      for (const s of all) {
        const dateISO = workoutsById[s.workoutId]?.dateISO;
        if (!dateISO) continue;
        (byDate[dateISO] ||= []).push(s);
      }

      const rows = Object.entries(byDate)
        .map(([dateISO, sets]) => {
          if (isTimed) {
            const bestDuration = Math.max(
              ...sets.map((s) => s.durationSec ?? 0)
            );
            return { dateISO, bestDuration };
          } else {
            const maxWeight = Math.max(
              ...sets.map((s) => s.weightKg ?? 0)
            );
            const bestReps = Math.max(...sets.map((s) => s.reps ?? 0));
            const best1RM = Math.max(
              ...sets.map((s) => epley1RM(s.weightKg ?? 0, s.reps ?? 0))
            );
            return { dateISO, maxWeight, bestReps, est1RM: best1RM };
          }
        })
        .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

      setPoints(rows);

      // load cached PRs
      const prRow = await getPR(Number(exerciseId));
      setPr(prRow || null);
    })();
  }, [exerciseId, isTimed]);

  useEffect(() => {
    if (isTimed) setMetric("bestDuration");
    else if (metric === "bestDuration") setMetric("maxWeight");
  }, [isTimed]); // eslint-disable-line react-hooks/exhaustive-deps

  const series = useMemo(() => {
    if (isTimed) {
      return points.map((p) => ({ x: p.dateISO, y: p.bestDuration ?? 0 }));
    }
    if (metric === "maxWeight")
      return points.map((p) => ({ x: p.dateISO, y: p.maxWeight }));
    if (metric === "bestReps")
      return points.map((p) => ({ x: p.dateISO, y: p.bestReps }));
    return points.map((p) => ({ x: p.dateISO, y: p.est1RM }));
  }, [points, metric, isTimed]);

  const unit = isTimed ? "sec" : metric === "bestReps" ? "reps" : "kg";

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="h-10 border rounded px-3 text-base bg-zinc-900 border-zinc-800"
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
        >
          <option value="">Select Exercise</option>
          {(exercises ?? []).map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name}
            </option>
          ))}
        </select>

        {isTimed ? (
          <select
            className="h-10 border rounded px-3 text-base bg-zinc-900 border-zinc-800"
            value="bestDuration"
            disabled
          >
            <option value="bestDuration">Best Duration</option>
          </select>
        ) : (
          <select
            className="h-10 border rounded px-3 text-base bg-zinc-900 border-zinc-800"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            <option value="maxWeight">Max Weight</option>
            <option value="est1RM">Estimated 1RM</option>
            <option value="bestReps">Best Reps</option>
          </select>
        )}
      </div>

      <div className="mt-4 h-64 border rounded p-2 border-zinc-800 bg-zinc-900">
        {exerciseId ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 10, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" />
              <YAxis />
              <Tooltip
                formatter={(value) =>
                  isTimed ? [formatDuration(value), "Best"] : [value, "Value"]
                }
              />
              <Line type="monotone" dataKey="y" dot={{ r: 3 }} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-white/60 text-sm">
            Choose an exercise to see progress
          </div>
        )}
      </div>

      {/* PR summary card */}
      {pr && (
        <div className="mt-4 border rounded p-3 text-sm border-zinc-800 bg-zinc-900">
          <div className="font-semibold mb-1">🏆 Personal Records</div>
          <ul className="space-y-1">
            {pr.bestWeight != null && (
              <li className="flex justify-between">
                <span>Max Weight</span>
                <span className="font-medium">{pr.bestWeight} kg</span>
              </li>
            )}
            {pr.best1RM != null && (
              <li className="flex justify-between">
                <span>Estimated 1RM</span>
                <span className="font-medium">{pr.best1RM} kg</span>
              </li>
            )}
            {pr.bestReps != null && (
              <li className="flex justify-between">
                <span>Best Reps</span>
                <span className="font-medium">{pr.bestReps}</span>
              </li>
            )}
            {pr.bestDurationSec != null && (
              <li className="flex justify-between">
                <span>Best Duration</span>
                <span className="font-medium">
                  {formatDuration(pr.bestDurationSec)}
                </span>
              </li>
            )}
          </ul>
          <div className="text-xs text-white/60 mt-2">
            Updated {new Date(pr.updatedAt).toLocaleString()}
          </div>
        </div>
      )}

      {series.length > 0 && (
        <div className="mt-3 text-sm text-white/80">
          <strong>Latest:</strong>{" "}
          {isTimed
            ? formatDuration(series[series.length - 1].y)
            : series[series.length - 1].y}{" "}
          {isTimed ? "" : unit}
          &nbsp;|&nbsp;
          <strong>Best:</strong>{" "}
          {isTimed
            ? formatDuration(Math.max(...series.map((s) => s.y)))
            : Math.max(...series.map((s) => s.y))}{" "}
          {isTimed ? "" : unit}
        </div>
      )}
    </div>
  );
}

/* ---------- Settings Tab (Export / Import) ---------- */
function SettingsTab() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState("replace"); // 'replace' | 'merge'
  const fileInputRef = useRef();

  async function handleExport() {
    try {
      setExporting(true);
      const payload = await exportAll();
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      downloadJSON(`workout-tracker-backup-${ts}.json`, payload);
      alert("Export complete. File downloaded.");
    } catch (e) {
      console.error(e);
      alert("Export failed. See console for details.");
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);

      const text = await file.text();
      const json = JSON.parse(text);

      if (!json || typeof json !== "object" || !json.tables) {
        alert("Invalid backup file.");
        return;
      }

      if (mode === "replace") {
        const ok = window.confirm(
          "Replace mode will OVERWRITE all current data with the file contents. Proceed?"
        );
        if (!ok) return;
      } else {
        const ok = window.confirm(
          "Merge mode will try to upsert by ID. If IDs overlap from another device, data may collide. Proceed?"
        );
        if (!ok) return;
      }

      try {
        const pre = await exportAll();
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        downloadJSON(`pre-import-backup-${ts}.json`, pre);
      } catch {}

      await importAll(json, { mode });
      alert("Import complete.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e2) {
      console.error(e2);
      alert("Import failed. Make sure the file is a valid backup JSON.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
<section className="rounded-xl bg-[#343434] p-3">
        <h3 className="font-semibold">Backup & Restore</h3>
        <p className="text-sm text-white/70 mt-1">
          Export all local data (exercises, workouts, sets, PRs) to a JSON file,
          or import from a previous backup.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="min-h-[44px] px-4 rounded bg-white text-black disabled:opacity-60"
            disabled={exporting}
            onClick={handleExport}
          >
            {exporting ? "Exporting…" : "Export JSON"}
          </button>

          <label className="min-h-[44px] px-4 rounded border border-zinc-700 bg-zinc-800 flex items-center gap-2">
            <span>Import JSON</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleImportFile}
            />
          </label>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label className="text-sm text-white/80">Import mode</label>
          <select
            className="h-10 border rounded px-3 text-base bg-zinc-900 border-zinc-800"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={importing}
          >
            <option value="replace">Replace (recommended)</option>
            <option value="merge">Merge (advanced)</option>
          </select>
        </div>

        {importing && (
          <p className="text-sm text-white/70 mt-2">Importing… please wait.</p>
        )}
      </section>

      <section className="border border-zinc-800 rounded p-3 bg-zinc-900">
        <h3 className="font-semibold">Danger Zone</h3>
        <p className="text-sm text-white/70 mt-1">
          You can clear all local data if needed (use Export first).
        </p>
        <button
          className="mt-2 min-h-[44px] px-4 rounded border border-zinc-700 bg-zinc-800"
          onClick={async () => {
            const ok = window.confirm(
              "This will delete ALL local data (exercises, workouts, sets, PRs). Are you sure?"
            );
            if (!ok) return;
            await db.transaction(
              "rw",
              [db.exercises, db.workouts, db.sets, db.prs],
              async () => {
                await db.sets.clear();
                await db.workouts.clear();
                await db.prs.clear();
                await db.exercises.clear();
              }
            );
            alert("All local data cleared.");
          }}
        >
          Clear all data
        </button>
      </section>
    </div>
  );
}
