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

const TABS = ["Log", "Progress", "Exercises", "Settings"];

/* ---------- Shared hooks & utils ---------- */
function useLiveQueryHook(queryFn, deps = []) {
  const [data, setData] = useState(null);
  useEffect(() => {
    const subscription = liveQuery(queryFn).subscribe({
      next: (value) => setData(value),
      error: (err) => console.error(err),
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- App ---------- */
export default function App() {
  const [tab, setTab] = useState("Log");

  // Mobile gate (optional)
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!isMobile) {
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

  return (
    <div className="min-h-[100svh] max-w-xl mx-auto p-4 safe-top safe-bottom bg-white">
      <h1 className="text-2xl font-bold">Workout Tracker (Local)</h1>

      <div className="mt-4 pb-24">
        {tab === "Log" && <LogTab useLiveQuery={useLiveQueryHook} />}
        {tab === "Progress" && <ProgressTab useLiveQuery={useLiveQueryHook} />}
        {tab === "Exercises" && (
          <ExercisesTab useLiveQuery={useLiveQueryHook} />
        )}
        {tab === "Settings" && <SettingsTab />}
      </div>

      {/* Sticky bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 border-t bg-white safe-bottom">
        <div className="mx-auto max-w-xl flex justify-around">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm ${
                tab === t ? "font-semibold text-black" : "text-gray-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/* ---------- Exercises Tab ---------- */
function ExercisesTab({ useLiveQuery }) {
  const exercises = useLiveQuery(getExercises, []);
  const [name, setName] = useState("");
  const [type, setType] = useState("weighted");
  const [error, setError] = useState("");

  async function handleAdd(e) {
    e.preventDefault();
    try {
      if (!name.trim()) return;
      await addExercise({ name: name.trim(), type });
      setName("");
      setType("weighted");
      setError("");
    } catch (err) {
      setError(err.message || "Failed to add exercise");
    }
  }

  async function onDeleteExercise(id, label) {
    const ok = window.confirm(
      `Delete "${label}"?\n\nThis will also delete all sets logged for this exercise.`
    );
    if (!ok) return;
    await deleteExercise(id);
  }

  async function onRenameExercise(ex) {
    const next = window.prompt("Rename exercise", ex.name);
    if (next == null) return; // cancel
    const clean = next.trim();
    if (!clean || clean === ex.name) return;
    await updateExerciseName(ex.id, clean);
  }

  return (
    <div>
      <h2 className="font-semibold">Your exercises</h2>
      <form onSubmit={handleAdd} className="mt-3 flex gap-2">
        <input
          className="h-10 border rounded px-3 text-base flex-1"
          placeholder="e.g., Bench Press"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="h-10 border rounded px-3 text-base"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="weighted">Weighted</option>
          <option value="bodyweight">Bodyweight</option>
        </select>
        <button
          className="min-h-[44px] px-4 rounded bg-black text-white"
          type="submit"
        >
          Add
        </button>
      </form>
      {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}

      <ul className="mt-4 space-y-2">
        {(exercises ?? []).map((ex) => (
          <li key={ex.id} className="border rounded p-2">
            <div className="flex justify-between items-center">
              <div className="min-w-0">
                <span className="font-medium truncate">{ex.name}</span>
                <span className="ml-2 text-xs text-gray-500">{ex.type}</span>
              </div>
              <div className="flex gap-2">
                <button
                  className="min-h-[36px] px-3 border rounded"
                  onClick={() => onRenameExercise(ex)}
                  title="Rename exercise"
                >
                  Rename
                </button>
                <button
                  className="min-h-[36px] px-3 border rounded"
                  onClick={() => onDeleteExercise(ex.id, ex.name)}
                  title="Delete exercise and its sets"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
        {exercises?.length === 0 && (
          <p className="text-gray-500">No exercises yet — add one above.</p>
        )}
      </ul>
    </div>
  );
}

/* ---------- Log Tab ---------- */
function LogTab({ useLiveQuery }) {
  const [dateISO, setDateISO] = useState(todayISO());
  const [workoutId, setWorkoutId] = useState(null);
  const exercises = useLiveQuery(getExercises, []);
  const [selectedExerciseId, setSelectedExerciseId] = useState("");

  // Keep a string for the input field to allow temporary empty value,
  // and a numeric state we actually use for logic.
  const [numSetsInput, setNumSetsInput] = useState("3");
  const [numSets, setNumSets] = useState(3);
  const [sets, setSets] = useState([{ reps: "", weight: "" }]);

  const workoutsToday = useLiveQuery(() => getWorkoutsByDate(dateISO), [dateISO]);
  const setsForWorkout = useLiveQuery(
    () => (workoutId ? getSetsForWorkout(workoutId) : Promise.resolve([])),
    [workoutId]
  );

  useEffect(() => {
    if (workoutsToday && workoutsToday[0]) setWorkoutId(workoutsToday[0].id);
    else setWorkoutId(null);
  }, [workoutsToday]);

  // Keep sets array in sync with count
  function syncSetArray(nextCount) {
    const count = Math.max(1, Math.min(nextCount, 20)); // 1..20
    setNumSets(count);
    setSets((prev) => {
      const next = Array.from({ length: count }, (_, i) => prev[i] ?? { reps: "", weight: "" });
      return next;
    });
  }

  function onNumSetsChangeTyping(value) {
    // Allow only digits, max 2 chars (so user can type freely)
    if (!/^\d{0,2}$/.test(value)) return;
    setNumSetsInput(value);
    // Do not coerce here — user may be mid-edit (e.g., empty string)
  }

  function onNumSetsBlur() {
    const parsed = parseInt(numSetsInput, 10);
    const safe = Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 20)) : 1;
    setNumSetsInput(String(safe));
    syncSetArray(safe);
  }

  function bumpSets(delta) {
    const parsed = parseInt(numSetsInput || "0", 10);
    const base = Number.isFinite(parsed) ? parsed : 1;
    const next = Math.max(1, Math.min(base + delta, 20));
    setNumSetsInput(String(next));
    syncSetArray(next);
  }

  async function ensureWorkout() {
    if (workoutId) return workoutId;
    const id = await createWorkout(dateISO);
    setWorkoutId(id);
    return id;
  }

  async function addExerciseSets() {
    if (!selectedExerciseId) return;
    const wid = await ensureWorkout();
    for (let i = 0; i < numSets; i++) {
      const { reps, weight } = sets[i] || {};
      const repsNum = Number(reps);
      const weightNum = weight === "" ? null : Number(weight);
      if (!Number.isFinite(repsNum) || repsNum <= 0) continue;
      await addSet({
        workoutId: wid,
        exerciseId: Number(selectedExerciseId),
        setIndex: i + 1,
        reps: repsNum,
        weightKg: weightNum,
      });
    }
    // reset inputs to a single empty row (keep count as-is)
    setSets([{ reps: "", weight: "" }]);
  }

  async function onDeleteSet(id) {
    const ok = window.confirm("Delete this set?");
    if (!ok) return;
    await deleteSet(id);
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-700">Date</label>
        <input
          type="date"
          className="h-10 border rounded px-3 text-base"
          value={dateISO}
          onChange={(e) => setDateISO(e.target.value)}
        />
        <button
          className="min-h-[44px] px-4 rounded border"
          onClick={async () => {
            await ensureWorkout();
          }}
        >
          {workoutId ? "Workout Exists" : "Create Workout"}
        </button>
      </div>

      <div className="mt-4 border rounded p-3">
        <h3 className="font-semibold">Add sets</h3>
        <div className="mt-2 flex flex-wrap gap-2 items-center">
          <select
            className="h-10 border rounded px-3 text-base"
            value={selectedExerciseId}
            onChange={(e) => setSelectedExerciseId(e.target.value)}
          >
            <option value="">Select Exercise</option>
            {(exercises ?? []).map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>

          {/* Number of sets input with +/- and safe handling */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-10 w-10 border rounded"
              onClick={() => bumpSets(-1)}
              aria-label="Decrease number of sets"
            >
              –
            </button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="w-20 h-10 border rounded px-3 text-base text-center"
              value={numSetsInput}
              onChange={(e) => onNumSetsChangeTyping(e.target.value)}
              onBlur={onNumSetsBlur}
              placeholder="sets"
            />
            <button
              type="button"
              className="h-10 w-10 border rounded"
              onClick={() => bumpSets(1)}
              aria-label="Increase number of sets"
            >
              +
            </button>
            <span className="text-sm text-gray-600">sets</span>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {Array.from({ length: numSets }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-12 text-sm text-gray-600">Set {i + 1}</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="reps"
                className="w-24 h-10 border rounded px-3 text-base"
                value={sets[i]?.reps ?? ""}
                onChange={(e) => {
                  const next = [...sets];
                  next[i] = { ...(next[i] || {}), reps: e.target.value };
                  setSets(next);
                }}
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder="weight (kg)"
                className="w-32 h-10 border rounded px-3 text-base"
                value={sets[i]?.weight ?? ""}
                onChange={(e) => {
                  const next = [...sets];
                  next[i] = { ...(next[i] || {}), weight: e.target.value };
                  setSets(next);
                }}
              />
            </div>
          ))}
        </div>

        <button
          className="mt-3 min-h-[44px] px-4 rounded bg-black text-white"
          onClick={addExerciseSets}
        >
          Add to Workout
        </button>
      </div>

      <div className="mt-4">
        <h3 className="font-semibold mb-2">Logged sets for this date</h3>
        <ul className="space-y-2">
          {(setsForWorkout ?? []).map((s) => (
            <li key={s.id} className="border rounded p-2 text-sm">
              <RowForSet s={s} onDelete={onDeleteSet} />
            </li>
          ))}
          {workoutId && (setsForWorkout?.length ?? 0) === 0 && (
            <p className="text-gray-500 text-sm">No sets added yet.</p>
          )}
        </ul>
      </div>
    </div>
  );
}


/* ---------- Progress Tab ---------- */
function ProgressTab({ useLiveQuery }) {
  const exercises = useLiveQuery(getExercises, []);
  const [exerciseId, setExerciseId] = useState("");
  const [metric, setMetric] = useState("maxWeight"); // 'maxWeight' | 'bestReps' | 'est1RM'
  const [points, setPoints] = useState([]);

  useEffect(() => {
    (async () => {
      if (!exerciseId) {
        setPoints([]);
        return;
      }
      const all = await getSetsForExercise(Number(exerciseId));

      // Map workoutId -> workout (to get date)
      const workoutsById = {};
      await db.workouts
        .bulkGet([...new Set(all.map((s) => s.workoutId))])
        .then((arr) => {
          arr.forEach((w) => {
            if (w) workoutsById[w.id] = w;
          });
        });

      // Group sets by workout date
      const byDate = {};
      for (const s of all) {
        const dateISO = workoutsById[s.workoutId]?.dateISO;
        if (!dateISO) continue;
        (byDate[dateISO] ||= []).push(s);
      }

      const rows = Object.entries(byDate)
        .map(([dateISO, sets]) => {
          const maxWeight = Math.max(...sets.map((s) => s.weightKg ?? 0));
          const bestReps = Math.max(...sets.map((s) => s.reps ?? 0));
          const best1RM = Math.max(
            ...sets.map((s) => epley1RM(s.weightKg ?? 0, s.reps ?? 0))
          );
          return { dateISO, maxWeight, bestReps, est1RM: best1RM };
        })
        .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

      setPoints(rows);
    })();
  }, [exerciseId]);

  const series = useMemo(() => {
    if (metric === "maxWeight")
      return points.map((p) => ({ x: p.dateISO, y: p.maxWeight }));
    if (metric === "bestReps")
      return points.map((p) => ({ x: p.dateISO, y: p.bestReps }));
    return points.map((p) => ({ x: p.dateISO, y: p.est1RM }));
  }, [points, metric]);

  const unit = metric === "bestReps" ? "reps" : "kg";

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="h-10 border rounded px-3 text-base"
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

        <select
          className="h-10 border rounded px-3 text-base"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
        >
          <option value="maxWeight">Max Weight</option>
          <option value="est1RM">Estimated 1RM</option>
          <option value="bestReps">Best Reps</option>
        </select>
      </div>

      <div className="mt-4 h-64 border rounded p-2">
        {exerciseId ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={series}
              margin={{ top: 10, right: 16, bottom: 0, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="y" dot={{ r: 3 }} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Choose an exercise to see progress
          </div>
        )}
      </div>

      {series.length > 0 && (
        <div className="mt-3 text-sm text-gray-700">
          <strong>Latest:</strong> {series[series.length - 1].y} {unit} &nbsp;|&nbsp;
          <strong>Best:</strong> {Math.max(...series.map((s) => s.y))} {unit}
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

      // Optional: pre-import auto-backup
      try {
        const pre = await exportAll();
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        downloadJSON(`pre-import-backup-${ts}.json`, pre);
      } catch {
        // ignore backup errors
      }

      await importAll(json, { mode });
      alert("Import complete.");
      // Clear file input
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
      <section className="border rounded p-3">
        <h3 className="font-semibold">Backup & Restore</h3>
        <p className="text-sm text-gray-600 mt-1">
          Export all local data (exercises, workouts, sets) to a JSON file, or
          import from a previous backup.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="min-h-[44px] px-4 rounded bg-black text-white disabled:opacity-60"
            disabled={exporting}
            onClick={handleExport}
          >
            {exporting ? "Exporting…" : "Export JSON"}
          </button>

          <label className="min-h-[44px] px-4 rounded border flex items-center gap-2">
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
          <label className="text-sm text-gray-700">Import mode</label>
          <select
            className="h-10 border rounded px-3 text-base"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={importing}
          >
            <option value="replace">Replace (recommended)</option>
            <option value="merge">Merge (advanced)</option>
          </select>
        </div>

        {importing && (
          <p className="text-sm text-gray-600 mt-2">Importing… please wait.</p>
        )}
      </section>

      <section className="border rounded p-3">
        <h3 className="font-semibold">Danger Zone</h3>
        <p className="text-sm text-gray-600 mt-1">
          You can clear all local data if needed (use Export first).
        </p>
        <button
          className="mt-2 min-h-[44px] px-4 rounded border"
          onClick={async () => {
            const ok = window.confirm(
              "This will delete ALL local data (exercises, workouts, sets). Are you sure?"
            );
            if (!ok) return;
            await db.transaction("rw", [db.exercises, db.workouts, db.sets], async () => {
              await db.sets.clear();
              await db.workouts.clear();
              await db.exercises.clear();
            });
            alert("All local data cleared.");
          }}
        >
          Clear all data
        </button>
      </section>
    </div>
  );
}
