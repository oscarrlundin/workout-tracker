// src/db.js
import Dexie from "dexie";

export const db = new Dexie("workout-tracker");

// bump to v4 — adds defaultSets to templateItems
db.version(4).stores({
  exercises: "++id, name, type, createdAt",
  workouts: "++id, dateISO, notes",
  sets: "++id, workoutId, exerciseId, setIndex, reps, weightKg, durationSec",
  prs: "exerciseId",
  templates: "++id, name, createdAt",
  templateItems:
    "++id, templateId, exerciseId, order, defaultSets, defaultReps, defaultDurationSec, defaultWeightKg",
});


/* ---------------- Exercises ---------------- */
export async function addExercise({ name, type = "weighted", isTimed = false }) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Exercise name is required");
  if (!["weighted", "bodyweight"].includes(type))
    throw new Error("Invalid exercise type");
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
  if (count > 0)
    throw new Error(
      "Cannot convert timed/reps because this exercise already has logged sets."
    );
  return db.exercises.update(id, { isTimed: !!isTimed });
}

export async function deleteExercise(id) {
  return db.transaction("rw", db.sets, db.prs, db.exercises, async () => {
    await db.sets.where("exerciseId").equals(id).delete();
    await db.prs.delete(id);
    await db.exercises.delete(id);
  });
}

/* ---------------- Workouts ---------------- */
export async function createWorkout(dateISO, notes = "") {
  const cleanDate = String(dateISO || "").slice(0, 10);
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

/* ---------------- Sets ---------------- */
export async function addSet({
  workoutId,
  exerciseId,
  setIndex,
  reps = null,
  weightKg = null,
  durationSec = null,
}) {
  if (!workoutId || !exerciseId || !setIndex) throw new Error("Missing fields");
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
  const existing = await db.sets.get(id);
  await db.sets.update(id, patch);
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

/* ---------------- PRs ---------------- */
export async function updatePRForExercise(exerciseId) {
  const [ex, sets, prev] = await Promise.all([
    db.exercises.get(exerciseId),
    db.sets.where("exerciseId").equals(exerciseId).toArray(),
    db.prs.get(exerciseId),
  ]);
  if (!ex) return null;

  const bestWeight = Math.max(0, ...sets.map((s) => s.weightKg || 0)) || null;
  const bestReps = Math.max(0, ...sets.map((s) => s.reps || 0)) || null;
  const bestDurationSec = Math.max(0, ...sets.map((s) => s.durationSec || 0)) || null;
  const best1RM =
    Math.max(0, ...sets.map((s) => epley1RM(s.weightKg || 0, s.reps || 0))) || null;

  const next = {
    exerciseId,
    bestWeight,
    bestReps,
    bestDurationSec,
    best1RM,
    updatedAt: new Date().toISOString(),
  };
  await db.prs.put(next);
  return { current: next };
}
export async function getPR(exerciseId) {
  return db.prs.get(exerciseId);
}
export async function recalcAllPRs() {
  const exs = await db.exercises.toArray();
  for (const ex of exs) await updatePRForExercise(ex.id);
}

/* ---------------- Templates ---------------- */
export async function addTemplate(name) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Template name required");
  const now = new Date().toISOString();
  return db.templates.add({ name: clean, createdAt: now });
}
export async function renameTemplate(id, name) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Name required");
  return db.templates.update(id, { name: clean });
}
export async function deleteTemplate(id) {
  return db.transaction("rw", db.templates, db.templateItems, async () => {
    await db.templateItems.where("templateId").equals(id).delete();
    await db.templates.delete(id);
  });
}
export async function getTemplates() {
  return db.templates.orderBy("createdAt").toArray();
}
export async function getTemplateWithItems(id) {
  const template = await db.templates.get(id);
  const items = await db.templateItems.where("templateId").equals(id).sortBy("order");
  return { template, items };
}

/* ---------------- Template Items ---------------- */
export async function addTemplateItem(templateId, exerciseId) {
  const existing = await db.templateItems.where({ templateId, exerciseId }).first();
  if (existing) return existing.id;
  const count = await db.templateItems.where("templateId").equals(templateId).count();
  return db.templateItems.add({
    templateId,
    exerciseId,
    order: count + 1,
    defaultReps: null,
    defaultDurationSec: null,
    defaultWeightKg: null,
  });
}
export async function deleteTemplateItem(id) {
  return db.templateItems.delete(id);
}
export async function updateTemplateItem(id, patch) {
  return db.templateItems.update(id, patch);
}

/* ---------------- Export / Import ---------------- */
export async function exportAll() {
  const data = await db.transaction(
    "r",
    db.exercises,
    db.workouts,
    db.sets,
    db.prs,
    db.templates,
    db.templateItems,
    async () => {
      const [exercises, workouts, sets, prs, templates, templateItems] =
        await Promise.all([
          db.exercises.toArray(),
          db.workouts.toArray(),
          db.sets.toArray(),
          db.prs.toArray(),
          db.templates.toArray(),
          db.templateItems.toArray(),
        ]);
      return { exercises, workouts, sets, prs, templates, templateItems };
    }
  );
  return {
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    tables: data,
  };
}

export async function importAll(payload, { mode = "replace" } = {}) {
  if (!payload || typeof payload !== "object" || !payload.tables)
    throw new Error("Invalid payload");
  const {
    exercises = [],
    workouts = [],
    sets = [],
    prs = [],
    templates = [],
    templateItems = [],
  } = payload.tables;

  await db.transaction(
    "rw",
    db.exercises,
    db.workouts,
    db.sets,
    db.prs,
    db.templates,
    db.templateItems,
    async () => {
      if (mode === "replace") {
        await Promise.all([
          db.exercises.clear(),
          db.workouts.clear(),
          db.sets.clear(),
          db.prs.clear(),
          db.templates.clear(),
          db.templateItems.clear(),
        ]);
      }
      await Promise.all([
        db.exercises.bulkPut(exercises),
        db.workouts.bulkPut(workouts),
        db.sets.bulkPut(sets),
        db.prs.bulkPut(prs),
        db.templates.bulkPut(templates),
        db.templateItems.bulkPut(templateItems),
      ]);
    }
  );
  await recalcAllPRs();
}
// Ensure database is opened immediately (avoids version upgrade issues)
db.open().catch((err) => {
  console.error("Dexie failed to open:", err);
});

