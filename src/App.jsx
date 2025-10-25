

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
      <h1 className="text-2xl font-bold">Repped</h1>

      <div className="mt-4 pb-24">
        {tab === "Log" && <LogTab useLiveQuery={useLiveQueryHook} showToast={showToast} />}
        {tab === "Progress" && <ProgressTab useLiveQuery={useLiveQueryHook} />}
        {tab === "Exercises" && <ExercisesTab useLiveQuery={useLiveQueryHook} />}
        {tab === "Templates" && <TemplatesTab useLiveQuery={useLiveQueryHook} />}
        {tab === "Settings" && <SettingsTab />}
      </div>

      <Toast message={toast} />

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
  const [isTimed, setIsTimed] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editTimed, setEditTimed] = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    try {
      if (!name.trim()) return;
      await addExercise({ name: name.trim(), type, isTimed });
      setName("");
      setType("weighted");
      setIsTimed(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveEdit(ex) {
    try {
      if (editName.trim() && editName.trim() !== ex.name)
        await updateExerciseName(ex.id, editName.trim());
      if (editTimed !== !!ex.isTimed)
        await updateExerciseTimed(ex.id, editTimed);
      setEditingId(null);
    } catch (e) {
      alert(e.message);
    }
  }

  async function onDeleteExercise(id, label) {
    if (!window.confirm(`Delete "${label}"?`)) return;
    await deleteExercise(id);
  }

  return (
    <div className="overflow-x-hidden">
      <h2 className="font-semibold">Your exercises</h2>

      <form onSubmit={handleAdd} className="mt-3 grid grid-cols-1 gap-2">
        <input
          className="h-10 border rounded px-3 text-base w-full"
          placeholder="e.g., Plank or Dead Hang"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            className="h-10 border rounded px-3 text-base"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="weighted">Weighted</option>
            <option value="bodyweight">Bodyweight</option>
          </select>
          <label className="h-10 border rounded px-3 flex items-center gap-2 text-base">
            <input
              type="checkbox"
              checked={isTimed}
              onChange={(e) => setIsTimed(e.target.checked)}
            />
            Timed
          </label>
        </div>
        <button className="min-h-[44px] px-4 rounded bg-black text-white">
          Add
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="mt-4 space-y-2">
        {(exercises ?? []).map((ex) => (
          <li key={ex.id} className="border rounded p-2">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium break-words">{ex.name}</div>
                <div className="flex gap-1 mt-1">
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {ex.type}
                  </span>
                  {ex.isTimed && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      timed
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="border rounded px-2"
                  onClick={() => {
                    setEditingId(ex.id);
                    setEditName(ex.name);
                    setEditTimed(!!ex.isTimed);
                  }}
                >
                  ✏️
                </button>
                <button
                  className="border rounded px-2"
                  onClick={() => onDeleteExercise(ex.id, ex.name)}
                >
                  🗑
                </button>
              </div>
            </div>

            {editingId === ex.id && (
              <div className="mt-2 border-t pt-2">
                <input
                  className="h-10 border rounded px-3 w-full mb-2"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editTimed}
                    onChange={(e) => setEditTimed(e.target.checked)}
                  />
                  Timed
                </label>
                <div className="flex gap-2 mt-2">
                  <button
                    className="px-3 py-1 rounded bg-black text-white"
                    onClick={() => saveEdit(ex)}
                  >
                    Save
                  </button>
                  <button
                    className="px-3 py-1 rounded border"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Templates Tab ---------- */
{/* list exercises in template (editable defaults) */}
/* ---------- Templates Tab ---------- */
function TemplatesTab({ useLiveQuery }) {
  const templates = useLiveQuery(getTemplates, []);
  const exercises = useLiveQuery(getExercises, []);
  const [name, setName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);

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
    () => (selectedTemplate ? getTemplateWithItems(selectedTemplate) : Promise.resolve(null)),
    [selectedTemplate]
  );

  return (
    <div className="overflow-x-hidden">
      <h2 className="font-semibold">Workout Templates</h2>

      {/* Create template */}
      <form onSubmit={handleAddTemplate} className="mt-3 flex gap-2">
        <input
          className="flex-1 h-10 border rounded px-3"
          placeholder="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="bg-black text-white px-4 rounded">Add</button>
      </form>

      {/* List templates */}
      <ul className="mt-4 space-y-2">
        {(templates ?? []).map((t) => (
          <li
            key={t.id}
            className={`border rounded p-2 ${selectedTemplate === t.id ? "bg-gray-50" : ""}`}
            onClick={() => setSelectedTemplate(t.id)}
          >
            <div className="flex justify-between items-center">
              <span className="font-medium">{t.name}</span>
              <button
                className="text-xs text-gray-500"
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
          <p className="text-gray-500 text-sm">No templates yet — create one above.</p>
        )}
      </ul>

      {/* Template detail */}
      {currentTemplate?.template && (
        <div className="mt-4 border-t pt-3">
          <h3 className="font-semibold">{currentTemplate.template.name} Exercises</h3>

          {/* Add exercise selector */}
          <div className="mt-2">
            <select
              className="w-full h-10 border rounded px-3"
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
                <li key={it.id} className="border rounded p-2 text-sm">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="font-medium break-words">{ex?.name ?? "Unknown Exercise"}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {ex?.type}{isTimed ? " · timed" : ""}
                        </span>
                      </div>
                    </div>
                    <button
                      className="text-xs text-gray-500 shrink-0"
                      onClick={() => deleteTemplateItem(it.id)}
                    >
                      Remove
                    </button>
                  </div>

                  {/* defaults editor */}
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-600">Sets</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        className="w-full h-9 border rounded px-2"
                        value={it.defaultSets ?? 1}
                        onChange={(e) =>
                          updateTemplateItem(it.id, {
                            defaultSets: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                          })
                        }
                      />
                    </div>

                    {!isTimed && (
                      <div>
                        <label className="block text-[11px] text-gray-600">Reps</label>
                        <input
                          type="number"
                          min={1}
                          max={200}
                          className="w-full h-9 border rounded px-2"
                          value={it.defaultReps ?? ""}
                          onChange={(e) =>
                            updateTemplateItem(it.id, {
                              defaultReps: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    )}

                    {isTimed && (
                      <div>
                        <label className="block text-[11px] text-gray-600">Duration (sec)</label>
                        <input
                          type="number"
                          min={1}
                          max={3600}
                          className="w-full h-9 border rounded px-2"
                          value={it.defaultDurationSec ?? ""}
                          onChange={(e) =>
                            updateTemplateItem(it.id, {
                              defaultDurationSec: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    )}

                    {isWeighted && (
                      <div>
                        <label className="block text-[11px] text-gray-600">Weight (kg)</label>
                        <input
                          type="number"
                          step="0.5"
                          className="w-full h-9 border rounded px-2"
                          value={it.defaultWeightKg ?? ""}
                          onChange={(e) =>
                            updateTemplateItem(it.id, {
                              defaultWeightKg: e.target.value === "" ? null : Number(e.target.value),
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
              <p className="text-gray-500 text-sm">No exercises yet.</p>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}


/* ---------- Log Tab (Phase A: grouped + expandable) ---------- */
function LogTab({ useLiveQuery, showToast }) {
  const exercises = useLiveQuery(getExercises, []);
  const templates = useLiveQuery(getTemplates, []);
  const [selectedDate, setSelectedDate] = useState(todayISO());

  const workouts = useLiveQuery(() => getWorkoutsByDate(selectedDate), [selectedDate]);
  const workoutId = workouts?.[0]?.id;
  const sets = useLiveQuery(
    () => (workoutId ? getSetsForWorkout(workoutId) : Promise.resolve([])),
    [workoutId]
  );

  const [expanded, setExpanded] = useState({});

  function toggleExpanded(exId) {
    setExpanded((prev) => ({ ...prev, [exId]: !prev[exId] }));
  }

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

  // helper for grouped sets by exercise
  const groupedSets = useMemo(() => {
    const grouped = {};
    (sets ?? []).forEach((s) => {
      if (!grouped[s.exerciseId]) grouped[s.exerciseId] = [];
      grouped[s.exerciseId].push(s);
    });
    return grouped;
  }, [sets]);

  return (
    <div>
      <h2 className="font-semibold">Log Workout</h2>

      {/* Date selector */}
      <div className="mt-3">
        <label className="block text-sm font-medium mb-1">Date</label>
        <input
          type="date"
          className="w-full h-10 border rounded px-3 text-base"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>

      {/* Load Template */}
      <div className="mt-3">
        <label className="block text-sm font-medium mb-1">Load Template</label>
        <select
          className="w-full h-10 border rounded px-3 text-base"
          onChange={async (e) => {
            const id = Number(e.target.value);
            if (!id) return;
            const data = await getTemplateWithItems(id);
            if (!data?.items?.length) return alert("This template has no exercises.");

            const wid = await createWorkout(selectedDate);
            for (const item of data.items) {
              const count = Math.max(1, item.defaultSets ?? 1);
              const ex = (exercises ?? []).find((e) => e.id === item.exerciseId);
              const isTimed = !!ex?.isTimed;
              const isWeighted = ex?.type === "weighted";

              // find max existing index for this exercise
              const currentMax =
                Math.max(
                  0,
                  ...((sets ?? [])
                    .filter((s) => s.exerciseId === item.exerciseId)
                    .map((s) => s.setIndex || 0))
                ) || 0;

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
            e.target.value = "";
          }}
          defaultValue=""
        >
          <option value="">Select Template...</option>
          {(templates ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Grouped exercises */}
      <div className="mt-4 space-y-3">
        {Object.entries(groupedSets).map(([exId, exSets]) => {
          const exercise = exercises?.find((e) => e.id === Number(exId));
          if (!exercise) return null;
          const isTimed = !!exercise.isTimed;
          const isWeighted = exercise.type === "weighted";

          // summary line
          const repsList = exSets.map((s) => s.reps).filter((r) => r != null);
          const durationList = exSets.map((s) => s.durationSec).filter((r) => r != null);
          const weightList = exSets.map((s) => s.weightKg).filter((r) => r != null);
          const uniformReps =
            repsList.length && repsList.every((v) => v === repsList[0]) ? repsList[0] : null;
          const uniformDur =
            durationList.length && durationList.every((v) => v === durationList[0])
              ? durationList[0]
              : null;
          const uniformW =
            weightList.length && weightList.every((v) => v === weightList[0])
              ? weightList[0]
              : null;

          const summary =
            isTimed && uniformDur
              ? `${exSets.length} sets × ${formatDuration(uniformDur)}`
              : !isTimed && uniformReps
              ? `${exSets.length} sets × ${uniformReps} reps`
              : `${exSets.length} sets`;

          return (
            <div key={exId} className="border rounded">
              <button
                className="w-full flex justify-between items-center p-2"
                onClick={() => toggleExpanded(exId)}
              >
                <div className="text-left">
                  <div className="font-medium">{exercise.name}</div>
                  <div className="text-sm text-gray-600">
                    {summary}
                    {isWeighted && uniformW != null ? ` @ ${uniformW} kg` : ""}
                  </div>
                </div>
                <div className="text-gray-500 text-sm">
                  {expanded[exId] ? "▲" : "▼"}
                </div>
              </button>

              {expanded[exId] && (
                <div className="border-t px-2 pb-2">
                  <table className="w-full text-sm mt-1">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left w-10">#</th>
                        {!isTimed && <th>Reps</th>}
                        {isTimed && <th>Time</th>}
                        {isWeighted && <th>Weight</th>}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {exSets
                        .sort((a, b) => a.setIndex - b.setIndex)
                        .map((s, idx) => (
                          <tr key={s.id}>
                            <td>{idx + 1}</td>
                            {!isTimed && (
                              <td>
                                <input
                                  type="number"
                                  className="w-20 border rounded px-1 text-center"
                                  value={s.reps ?? ""}
                                  onChange={(e) =>
                                    handleUpdateSet(s.id, "reps", e.target.value)
                                  }
                                />
                              </td>
                            )}
                            {isTimed && (
                              <td>
                                <input
                                  type="number"
                                  className="w-20 border rounded px-1 text-center"
                                  value={s.durationSec ?? ""}
                                  onChange={(e) =>
                                    handleUpdateSet(s.id, "durationSec", e.target.value)
                                  }
                                />
                              </td>
                            )}
                            {isWeighted && (
                              <td>
                                <input
                                  type="number"
                                  step="0.5"
                                  className="w-20 border rounded px-1 text-center"
                                  value={s.weightKg ?? ""}
                                  onChange={(e) =>
                                    handleUpdateSet(s.id, "weightKg", e.target.value)
                                  }
                                />
                              </td>
                            )}
                            <td className="text-right">
                              <button
                                className="text-xs text-gray-500"
                                onClick={() => handleDeleteSet(s.id)}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {(!sets || sets.length === 0) && (
          <p className="text-gray-500 text-sm text-center">
            No exercises logged for this date yet.
          </p>
        )}
      </div>
    </div>
  );
}



function RowForSet({ s, onDelete, showToast }) {
  const [exercise, setExercise] = useState(null);
  const [editing, setEditing] = useState(false);

  const [reps, setReps] = useState(s.reps ?? "");
  const [weight, setWeight] = useState(
    typeof s.weightKg === "number" ? String(s.weightKg) : ""
  );
  const [min, setMin] = useState(
    Number.isFinite(s.durationSec) ? String(Math.floor(s.durationSec / 60)) : ""
  );
  const [sec, setSec] = useState(
    Number.isFinite(s.durationSec) ? String(s.durationSec % 60) : ""
  );

  useEffect(() => {
    db.exercises.get(s.exerciseId).then(setExercise);
  }, [s.exerciseId]);

  const isTimed = !!exercise?.isTimed;
  const isWeighted = exercise?.type === "weighted";

  function prToastFromImprovements(exName, improvements) {
    if (!improvements) return;
    const parts = [];
    if (improvements.bestWeight)
      parts.push(`Max Weight ${improvements.bestWeight.new} kg`);
    if (improvements.best1RM)
      parts.push(`Est 1RM ${improvements.best1RM.new} kg`);
    if (improvements.bestReps)
      parts.push(`Best Reps ${improvements.bestReps.new}`);
    if (improvements.bestDurationSec)
      parts.push(`Best Duration ${formatDuration(improvements.bestDurationSec.new)}`);
    if (parts.length) showToast(`🎉 New PR – ${exName}: ${parts[0]}`);
  }

  async function onSave() {
    if (isTimed) {
      const m = Number(min || 0);
      let sc = Number(sec || 0);
      if (!Number.isFinite(m) && !Number.isFinite(sc)) return;
      sc = Math.max(0, Math.min(59, sc));
      const total = Math.round((m >= 0 ? m : 0) * 60 + (sc >= 0 ? sc : 0));
      if (!total) return;
      const weightNum = isWeighted && weight !== "" ? Number(weight) : null;
      const exerciseId = await updateSet(s.id, {
        durationSec: total,
        weightKg: Number.isFinite(weightNum) ? weightNum : null,
        reps: null,
      });
      const res = await updatePRForExercise(exerciseId || s.exerciseId);
      prToastFromImprovements(exercise?.name ?? "Exercise", res?.improvements);
    } else {
      const repsNum = Number(reps);
      if (!Number.isFinite(repsNum) || repsNum <= 0) return;
      const weightNum = weight === "" ? null : Number(weight);
      const exerciseId = await updateSet(s.id, {
        reps: repsNum,
        weightKg: Number.isFinite(weightNum) ? weightNum : null,
        durationSec: null,
      });
      const res = await updatePRForExercise(exerciseId || s.exerciseId);
      prToastFromImprovements(exercise?.name ?? "Exercise", res?.improvements);
    }
    setEditing(false);
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-medium truncate">{exercise?.name ?? "…"}</div>

        {!editing ? (
          <div className="text-gray-600 text-sm">
            Set {s.setIndex}:{" "}
            {isTimed
              ? `${formatDuration(s.durationSec ?? 0)}`
              : `${s.reps} reps`}
            {typeof s.weightKg === "number" ? ` @ ${s.weightKg} kg` : ""}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mt-1">
            {isTimed ? (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-20 h-10 border rounded px-3 text-base"
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                  placeholder="min"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-20 h-10 border rounded px-3 text-base"
                  value={sec}
                  onChange={(e) => setSec(e.target.value)}
                  placeholder="sec"
                />
                {isWeighted && (
                  <input
                    type="text"
                    inputMode="decimal"
                    className="w-28 h-10 border rounded px-3 text-base"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="weight (kg)"
                  />
                )}
              </>
            ) : (
              <>
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
              </>
            )}
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
              onClick={() => onDelete(s.id, s)}
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
                setReps(s.reps ?? "");
                setWeight(typeof s.weightKg === "number" ? String(s.weightKg) : "");
                setMin(
                  Number.isFinite(s.durationSec)
                    ? String(Math.floor(s.durationSec / 60))
                    : ""
                );
                setSec(
                  Number.isFinite(s.durationSec) ? String(s.durationSec % 60) : ""
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
            const bestDuration = Math.max(...sets.map((s) => s.durationSec ?? 0));
            return { dateISO, bestDuration };
          } else {
            const maxWeight = Math.max(...sets.map((s) => s.weightKg ?? 0));
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

        {isTimed ? (
          <select
            className="h-10 border rounded px-3 text-base"
            value="bestDuration"
            disabled
          >
            <option value="bestDuration">Best Duration</option>
          </select>
        ) : (
          <select
            className="h-10 border rounded px-3 text-base"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            <option value="maxWeight">Max Weight</option>
            <option value="est1RM">Estimated 1RM</option>
            <option value="bestReps">Best Reps</option>
          </select>
        )}
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
              <Tooltip
                formatter={(value) =>
                  isTimed ? [formatDuration(value), "Best"] : [value, "Value"]
                }
              />
              <Line type="monotone" dataKey="y" dot={{ r: 3 }} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Choose an exercise to see progress
          </div>
        )}
      </div>

      {/* PR summary card */}
      {pr && (
        <div className="mt-4 border rounded p-3 text-sm">
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
          <div className="text-xs text-gray-500 mt-2">
            Updated {new Date(pr.updatedAt).toLocaleString()}
          </div>
        </div>
      )}

      {series.length > 0 && (
        <div className="mt-3 text-sm text-gray-700">
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
      <section className="border rounded p-3">
        <h3 className="font-semibold">Backup & Restore</h3>
        <p className="text-sm text-gray-600 mt-1">
          Export all local data (exercises, workouts, sets, PRs) to a JSON file,
          or import from a previous backup.
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
              "This will delete ALL local data (exercises, workouts, sets, PRs). Are you sure?"
            );
            if (!ok) return;
            await db.transaction("rw", [db.exercises, db.workouts, db.sets, db.prs], async () => {
              await db.sets.clear();
              await db.workouts.clear();
              await db.prs.clear();
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
