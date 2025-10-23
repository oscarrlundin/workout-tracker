// src/db.js
import Dexie from "dexie";

export const db = new Dexie("workoutTracker");
db.version(1).stores({
  exercises: "++id, name, type, createdAt",   // type: 'weighted' | 'bodyweight'
  workouts: "++id, dateISO, notes",
  sets: "++id, workoutId, exerciseId, setIndex, reps, weightKg"
});

// ------- Exercise helpers -------
export async function addExercise({ name, type = "weighted" }) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Exercise needs a name");
  return db.exercises.add({ name: trimmed, type, createdAt: new Date().toISOString() });
}

export const getExercises = () => db.exercises.orderBy("createdAt").toArray();

export async function deleteExercise(exerciseId) {
  // Delete the exercise and all of its sets in a single transaction
  await db.transaction('rw', db.sets, db.exercises, async () => {
    await db.sets.where('exerciseId').equals(exerciseId).delete();
    await db.exercises.delete(exerciseId);
  });
}

// (optional for later)
// export function updateExerciseName(id, name) {
//   const trimmed = (name || "").trim();
//   if (!trimmed) return Promise.resolve();
//   return db.exercises.update(id, { name: trimmed });
// }

// ------- Workout helpers -------
export async function createWorkout(dateISO) {
  return db.workouts.add({ dateISO, notes: "" });
}

export const getWorkoutsByDate = (dateISO) =>
  db.workouts.where("dateISO").equals(dateISO).toArray();

// ------- Sets helpers -------
export async function addSet({ workoutId, exerciseId, setIndex, reps, weightKg }) {
  return db.sets.add({ workoutId, exerciseId, setIndex, reps, weightKg: weightKg ?? null });
}

export const getSetsForWorkout = (workoutId) =>
  db.sets.where("workoutId").equals(workoutId).sortBy("setIndex");

export const getSetsForExercise = (exerciseId) =>
  db.sets.where("exerciseId").equals(exerciseId).toArray();

export function updateSet(id, fields) {
  return db.sets.update(id, fields);
}

export function deleteSet(id) {
  return db.sets.delete(id);
}

// ------- Metrics -------
export function epley1RM(weightKg, reps) {
  if (!weightKg || !reps) return 0;
  return Math.round(weightKg * (1 + reps / 30));
}
// --- JSON EXPORT / IMPORT / RENAME HELPERS ---

/**
 * Export all app data to a versioned JSON payload.
 * Preserves row IDs so relationships (exerciseId/workoutId) stay intact.
 */
export async function exportAll() {
  const schemaVersion = db.verno || 1;
  const exportedAt = new Date().toISOString();

  const [exercises, workouts, sets] = await db.transaction('r', db.exercises, db.workouts, db.sets, async () => {
    const ex = await db.exercises.toArray();
    const wo = await db.workouts.toArray();
    const se = await db.sets.toArray();
    return [ex, wo, se];
  });

  return {
    schemaVersion,
    exportedAt,
    tables: {
      exercises,
      workouts,
      sets,
    },
  };
}

/**
 * Import from a previously exported JSON.
 * mode: 'replace' | 'merge' (default 'replace')
 * - replace: clears existing tables then bulkPut incoming rows (keeps incoming IDs)
 * - merge: upserts rows by ID; ignores missing relations check for speed (assumes exportAll format)
 */
export async function importAll(payload, { mode = 'replace' } = {}) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid file: not an object');
  if (!payload.tables || typeof payload.tables !== 'object') throw new Error('Invalid file: missing tables');
  const { exercises = [], workouts = [], sets = [] } = payload.tables;

  // Basic shape checks
  if (!Array.isArray(exercises) || !Array.isArray(workouts) || !Array.isArray(sets)) {
    throw new Error('Invalid file: tables must be arrays');
  }

  if (mode === 'replace') {
    // Full replace in a single transaction
    await db.transaction('rw', db.exercises, db.workouts, db.sets, async () => {
      await Promise.all([
        db.sets.clear(),
        db.workouts.clear(),
        db.exercises.clear(),
      ]);
      // Preserve incoming IDs
      await db.exercises.bulkPut(exercises);
      await db.workouts.bulkPut(workouts);
      await db.sets.bulkPut(sets);
    });
    return { mode, replaced: true, counts: { exercises: exercises.length, workouts: workouts.length, sets: sets.length } };
  }

  // Merge: upsert by ID (keeps existing rows if ID collision, prefers incoming data)
  if (mode === 'merge') {
    await db.transaction('rw', db.exercises, db.workouts, db.sets, async () => {
      if (exercises.length) await db.exercises.bulkPut(exercises);
      if (workouts.length) await db.workouts.bulkPut(workouts);
      if (sets.length) await db.sets.bulkPut(sets);
    });
    return { mode, merged: true, counts: { exercises: exercises.length, workouts: workouts.length, sets: sets.length } };
  }

  throw new Error(`Unknown import mode: ${mode}`);
}

/**
 * Rename an exercise by ID
 */
export async function updateExerciseName(exerciseId, newName) {
  const name = String(newName || '').trim();
  if (!name) throw new Error('Exercise name cannot be empty');
  await db.exercises.update(exerciseId, { name });
  return true;
}
