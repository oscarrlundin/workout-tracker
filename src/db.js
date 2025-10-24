// src/db.js
import Dexie from "dexie";

export const db = new Dexie("workout-tracker");
db.version(1).stores({
  exercises: "++id, name, type, createdAt",
  workouts: "++id, dateISO, notes",
  sets: "++id, workoutId, exerciseId, setIndex, reps, weightKg",
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

/** Block converting timed <-> reps if sets already exist for the exercise */
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
  return db.transaction("rw", db.sets, db.exercises, async () => {
    await db.sets.where("exerciseId").equals(id).delete();
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

/* ---------------- Helpers: Sets ---------------- */

export async function addSet({
  workoutId,
  exerciseId,
  setIndex,
  reps = null,          // integer, for non-timed
  weightKg = null,      // number | null
  durationSec = null,   // integer seconds, for timed
}) {
  if (!workoutId || !exerciseId || !setIndex) throw new Error("Missing fields");
  // We allow either reps OR durationSec (or both null while drafting), but saving should pass one of them.
  return db.sets.add({
    workoutId,
    exerciseId,
    setIndex,
    reps: typeof reps === "number" ? reps : null,
    weightKg: typeof weightKg === "number" ? weightKg : null,
    durationSec: typeof durationSec === "number" ? durationSec : null,
  });
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
  return db.sets.update(id, clean);
}

export async function deleteSet(id) {
  return db.sets.delete(id);
}

export async function getSetsForWorkout(workoutId) {
  return db.sets.where("workoutId").equals(workoutId).sortBy("setIndex");
}

export async function getSetsForExercise(exerciseId) {
  return db.sets.where("exerciseId").equals(exerciseId).toArray();
}

/* ---------------- Utils ---------------- */

export function epley1RM(weight, reps) {
  const w = Number(weight || 0);
  const r = Number(reps || 0);
  if (!w || !r) return 0;
  return Math.round(w * (1 + r / 30));
}

/* ---------------- Export / Import ---------------- */

export async function exportAll() {
  const data = await db.transaction("r", db.exercises, db.workouts, db.sets, async () => {
    const [exercises, workouts, sets] = await Promise.all([
      db.exercises.toArray(),
      db.workouts.toArray(),
      db.sets.toArray(),
    ]);
    return { exercises, workouts, sets };
  });
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    tables: data,
  };
}

export async function importAll(payload, { mode = "replace" } = {}) {
  if (!payload || typeof payload !== "object" || !payload.tables) {
    throw new Error("Invalid payload");
  }
  const { exercises = [], workouts = [], sets = [] } = payload.tables;

  if (mode === "replace") {
    await db.transaction("rw", db.exercises, db.workouts, db.sets, async () => {
      await db.sets.clear();
      await db.workouts.clear();
      await db.exercises.clear();
      if (exercises.length) await db.exercises.bulkPut(exercises);
      if (workouts.length) await db.workouts.bulkPut(workouts);
      if (sets.length) await db.sets.bulkPut(sets);
    });
    return;
  }

  if (mode === "merge") {
    await db.transaction("rw", db.exercises, db.workouts, db.sets, async () => {
      if (exercises.length) await db.exercises.bulkPut(exercises);
      if (workouts.length) await db.workouts.bulkPut(workouts);
      if (sets.length) await db.sets.bulkPut(sets);
    });
    return;
  }

  throw new Error("Unknown import mode");
}
