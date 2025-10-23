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
