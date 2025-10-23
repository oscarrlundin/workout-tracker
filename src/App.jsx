// src/App.jsx
import { useEffect, useMemo, useState } from "react";
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

const TABS = ["Log", "Progress", "Exercises"];

// Live data hook using Dexie's liveQuery
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

export default function App() {
  const [tab, setTab] = useState("Log");

  // (Optional) Gate desktop users since this is mobile-first
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

      {/* Main content (add bottom padding so it doesn't hide behind the tab bar) */}
      <div className="mt-4 pb-24">
        {tab === "Log" && <LogTab useLiveQuery={useLiveQueryHook} />}
        {tab === "Progress" && <ProgressTab useLiveQuery={useLiveQueryHook} />}
        {tab === "Exercises" && (
          <ExercisesTab useLiveQuery={useLiveQueryHook} />
        )}
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
      await addExercise({ name, type });
      setName("");
      setType("weighted");
      setError("");
    } catch (err) {
      setError(err.message);
    }
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
        <button className="min-h-[44px] px-4 rounded bg-black text-white">
          Add
        </button>
      </form>
      {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}

      <ul className="mt-4 space-y-2">
        {(exercises ?? []).map((ex) => (
          <li key={ex.id} className="border rounded p-2">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-medium">{ex.name}</span>
                <span className="ml-2 text-xs text-gray-500">{ex.type}</span>
              </div>
              <button
                className="min-h-[36px] px-3 border rounded"
                onClick={() => deleteExercise(ex.id)}
                title="Delete exercise and its sets"
              >
                Delete
              </button>
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

  function handleNumSetsChange(n) {
    setNumSets(n);
    setSets(
      Array.from({ length: n }, (_, i) => sets[i] ?? { reps: "", weight: "" })
    );
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
      if (!repsNum || repsNum < 0) continue;
      await addSet({
        workoutId: wid,
        exerciseId: Number(selectedExerciseId),
        setIndex: i + 1,
        reps: repsNum,
        weightKg: weightNum,
      });
    }
    // reset inputs
    setSets([{ reps: "", weight: "" }]);
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
        <div className="mt-2 flex flex-wrap gap-2">
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

          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="w-28 h-10 border rounded px-3 text-base"
            value={numSets}
            onChange={(e) => handleNumSetsChange(Number(e.target.value))}
          />
          <span className="text-sm text-gray-600 self-center">sets</span>
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
              <RowForSet s={s} />
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

function RowForSet({ s }) {
  const [exercise, setExercise] = useState(null);
  const [editing, setEditing] = useState(false);
  const [reps, setReps] = useState(s.reps);
  const [weight, setWeight] = useState(
    typeof s.weightKg === "number" ? String(s.weightKg) : ""
  );

  useEffect(() => {
    db.exercises.get(s.exerciseId).then(setExercise);
  }, [s.exerciseId]);

  async function onSave() {
    const repsNum = Number(reps);
    const weightNum = weight === "" ? null : Number(weight);
    if (!repsNum || repsNum < 0) return;
    await updateSet(s.id, { reps: repsNum, weightKg: weightNum });
    setEditing(false);
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-medium truncate">{exercise?.name ?? "…"}</div>

        {!editing ? (
          <div className="text-gray-600 text-sm">
            Set {s.setIndex}: {s.reps} reps
            {typeof s.weightKg === "number" ? ` @ ${s.weightKg} kg` : ""}
          </div>
        ) : (
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              inputMode="numeric"
              className="w-24 h-10 border rounded px-3 text-base"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              placeholder="reps"
            />
            <input
              type="text"
              inputMode="decimal"
              className="w-28 h-10 border rounded px-3 text-base"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="weight (kg)"
            />
          </div>
        )}
      </div>

      <div className="flex shrink-0 gap-2">
        {!editing ? (
          <>
            <button
              className="min-h-[36px] px-3 border rounded"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button
              className="min-h-[36px] px-3 border rounded"
              onClick={() => deleteSet(s.id)}
            >
              Delete
            </button>
          </>
        ) : (
          <>
            <button
              className="min-h-[36px] px-3 border rounded bg-black text-white"
              onClick={onSave}
            >
              Save
            </button>
            <button
              className="min-h-[36px] px-3 border rounded"
              onClick={() => {
                setEditing(false);
                setReps(s.reps);
                setWeight(
                  typeof s.weightKg === "number" ? String(s.weightKg) : ""
                );
              }}
            >
              Cancel
            </button>
          </>
        )}
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
