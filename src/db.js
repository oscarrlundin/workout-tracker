// src/db.js
import Dexie from "dexie";

export const db = new Dexie("workout-tracker");

// v1 (original tables)
db.version(1).stores({
  exercises: "++id, name, type, createdAt",
  workouts: "++id, dateISO, notes",
  sets: "++id, workoutId, exerciseId, setIndex, reps, weightKg",
});

// v2 (adds durationSec and prs table)
db.version(2).stores({
  exercises: "++id, name, type, createdAt",
  workouts: "++id, dateISO, notes",
  sets: "++id, workoutId, exerciseId, setIndex, reps, weightKg, durationSec",
  prs: "exerciseId", // 1 row per exercise
});

/* ---------------- Helpers: Exercises ---------------- */

export async function addExercise({ name, type = "weighted", isTimed = false }) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Exercise name is required");
  if (!["weighted", "bodyweight"].includes(type)) {
    throw new Error("Invalid exercise type");
  }
  const now = new Date().toISOString();
  return db.exercises.add({ name: clean, type, isTimed: !!isTimed, createdAt: now });
}

export async function getExercises() {
  return db.exercises.orderBy("createdAt").toArray();
}

export async function updateExerciseName(id, name) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Name is required");
  return db.exercises.update(id, { name: clean });
}

export async function updateExerciseTimed(id, isTimed) {
  const count = await db.sets.where("exerciseId").equals(id).count();
  if (count > 0) {
    throw new Error(
      "Cannot convert timed/reps because this exercise already has logged sets. (Delete sets first or create a new exercise.)"
    );
  }
  return db.exercises.update(id, { isTimed: !!isTimed });
}

export async function deleteExercise(id) {
  return db.transaction("rw", db.sets, db.prs, db.exercises, async () => {
    await db.sets.where("exerciseId").equals(id).delete();
    await db.prs.delete(id);
    await db.exercises.delete(id);
  });
}

/* ---------------- Helpers: Workouts ---------------- */

export async function createWorkout(dateISO, notes = "") {
  const cleanDate = String(dateISO || "").slice(0, 10);
  if (!cleanDate) throw new Error("dateISO required");
  const existing = await db.workouts.where("dateISO").equals(cleanDate).first();
  if (existing) return existing.id;
  return db.workouts.add({ dateISO: cleanDate, notes });
}

export async function getWorkoutsByDate(dateISO) {
  const d = String(dateISO || "").slice(0, 10);
  return db.workouts.where("dateISO").equals(d).toArray();
}

/* ---------------- Utils ---------------- */

export function epley1RM(weight, reps) {
  const w = Number(weight || 0);
  const r = Number(reps || 0);
  if (!w || !r) return 0;
  return Math.round(w * (1 + r / 30));
}

/* ---------------- Helpers: Sets ---------------- */

export async function addSet({
  workoutId,
  exerciseId,
  setIndex,
  reps = null,
  weightKg = null,
  durationSec = null,
}) {
  if (!workoutId || !exerciseId || !setIndex) throw new Error("Missing fields");
  const id = await db.sets.add({
    workoutId,
    exerciseId,
    setIndex,
    reps: typeof reps === "number" ? reps : null,
    weightKg: typeof weightKg === "number" ? weightKg : null,
    durationSec: typeof durationSec === "number" ? durationSec : null,
  });
  return id;
}

export async function updateSet(id, patch) {
  const clean = {};
  if ("reps" in patch) clean.reps = patch.reps ?? null;
  if ("weightKg" in patch)
    clean.weightKg =
      typeof patch.weightKg === "number" ? patch.weightKg : null;
  if ("durationSec" in patch)
    clean.durationSec =
      typeof patch.durationSec === "number" ? patch.durationSec : null;
  if ("setIndex" in patch) clean.setIndex = patch.setIndex;

  const existing = await db.sets.get(id);
  await db.sets.update(id, clean);
  return existing?.exerciseId ?? null;
}

export async function deleteSet(id) {
  const existing = await db.sets.get(id);
  await db.sets.delete(id);
  return existing?.exerciseId ?? null;
}

export async function getSetsForWorkout(workoutId) {
  return db.sets.where("workoutId").equals(workoutId).sortBy("setIndex");
}

export async function getSetsForExercise(exerciseId) {
  return db.sets.where("exerciseId").equals(exerciseId).toArray();
}

/* ---------------- PRs: compute & store ---------------- */

export async function updatePRForExercise(exerciseId) {
  const [ex, sets, prev] = await Promise.all([
    db.exercises.get(exerciseId),
    db.sets.where("exerciseId").equals(exerciseId).toArray(),
    db.prs.get(exerciseId),
  ]);

  if (!ex) return null;

  const bestWeight = (() => {
    const vals = sets.map((s) => (typeof s.weightKg === "number" ? s.weightKg : 0));
    const m = Math.max(0, ...vals);
    return m > 0 ? m : null;
  })();

  const bestReps = (() => {
    const vals = sets.map((s) => (typeof s.reps === "number" ? s.reps : 0));
    const m = Math.max(0, ...vals);
    return m > 0 ? m : null;
  })();

  const bestDurationSec = (() => {
    const vals = sets.map((s) =>
      typeof s.durationSec === "number" ? s.durationSec : 0
    );
    const m = Math.max(0, ...vals);
    return m > 0 ? m : null;
  })();

  const best1RM = (() => {
    const vals = sets.map((s) =>
      typeof s.weightKg === "number" && typeof s.reps === "number"
        ? epley1RM(s.weightKg, s.reps)
        : 0
    );
    const m = Math.max(0, ...vals);
    return m > 0 ? m : null;
  })();

  const next = {
    exerciseId,
    bestWeight,
    bestReps,
    bestDurationSec,
    best1RM,
    updatedAt: new Date().toISOString(),
  };

  const improvements = {};
  if (prev) {
    if ((next.bestWeight ?? 0) > (prev.bestWeight ?? 0))
      improvements.bestWeight = { old: prev.bestWeight ?? null, new: next.bestWeight };
    if ((next.bestReps ?? 0) > (prev.bestReps ?? 0))
      improvements.bestReps = { old: prev.bestReps ?? null, new: next.bestReps };
    if ((next.bestDurationSec ?? 0) > (prev.bestDurationSec ?? 0))
      improvements.bestDurationSec = {
        old: prev.bestDurationSec ?? null,
        new: next.bestDurationSec,
      };
    if ((next.best1RM ?? 0) > (prev.best1RM ?? 0))
      improvements.best1RM = { old: prev.best1RM ?? null, new: next.best1RM };
  } else {
    if (next.bestWeight != null) improvements.bestWeight = { old: null, new: next.bestWeight };
    if (next.bestReps != null) improvements.bestReps = { old: null, new: next.bestReps };
    if (next.bestDurationSec != null)
      improvements.bestDurationSec = { old: null, new: next.bestDurationSec };
    if (next.best1RM != null) improvements.best1RM = { old: null, new: next.best1RM };
  }

  await db.prs.put(next);
  return { current: next, improvements };
}

export async function getPR(exerciseId) {
  return db.prs.get(exerciseId);
}

/** ✅ Recalculate PRs for every exercise (used on startup/import) */
export async function recalcAllPRs() {
  const exs = await db.exercises.toArray();
  for (const ex of exs) {
    await updatePRForExercise(ex.id);
  }
}

/* ---------------- Export / Import ---------------- */

export async function exportAll() {
  const data = await db.transaction(
    "r",
    db.exercises,
    db.workouts,
    db.sets,
    db.prs,
    async () => {
      const [exercises, workouts, sets, prs] = await Promise.all([
        db.exercises.toArray(),
        db.workouts.toArray(),
        db.sets.toArray(),
        db.prs.toArray(),
      ]);
      return { exercises, workouts, sets, prs };
    }
  );
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    tables: data,
  };
}

export async function importAll(payload, { mode = "replace" } = {}) {
  if (!payload || typeof payload !== "object" || !payload.tables) {
    throw new Error("Invalid payload");
  }
  const { exercises = [], workouts = [], sets = [], prs = [] } = payload.tables;

  if (mode === "replace") {
    await db.transaction(
      "rw",
      db.exercises,
      db.workouts,
      db.sets,
      db.prs,
      async () => {
        await db.sets.clear();
        await db.workouts.clear();
        await db.prs.clear();
        await db.exercises.clear();

        if (exercises.length) await db.exercises.bulkPut(exercises);
        if (workouts.length) await db.workouts.bulkPut(workouts);
        if (sets.length) await db.sets.bulkPut(sets);
        if (prs.length) await db.prs.bulkPut(prs);
      }
    );
    await recalcAllPRs();
    return;
  }

  if (mode === "merge") {
    await db.transaction(
      "rw",
      db.exercises,
      db.workouts,
      db.sets,
      db.prs,
      async () => {
        if (exercises.length) await db.exercises.bulkPut(exercises);
        if (workouts.length) await db.workouts.bulkPut(workouts);
        if (sets.length) await db.sets.bulkPut(sets);
        if (prs.length) await db.prs.bulkPut(prs);
      }
    );
    await recalcAllPRs();
    return;
  }

  throw new Error("Unknown import mode");
}
