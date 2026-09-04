/*
 * Program data. Edit this file to change your training program.
 * You never need to touch app.js to adjust exercises, sets, reps, or rest.
 *
 * Each exercise:
 *   name    - display name (also the identity used for history + progress)
 *   sets    - number of work sets
 *   repLow  - bottom of the target rep range
 *   repHigh - top of the target rep range (hit this on every work set to add weight)
 *   restSec - rest timer seconds after each logged set
 *   region  - "upper" or "lower" (upper adds +5 lb, lower adds +10 lb on progression)
 *   note    - optional short note shown on the exercise
 *
 * A day may instead be an AMRAP (as-many-rounds-as-possible) circuit. Give it
 *   type: "amrap", durationSec (e.g. 1200 for 20 min), and a movements list of
 *   { name, reps }. The app then shows a count-down clock and a round counter
 *   instead of weight/rep logging.
 */
const PROGRAM = {
  days: [
    {
      name: "Day 1 — Chest + Triceps",
      exercises: [
        { name: "Incline barbell or DB press", sets: 4, repLow: 6,  repHigh: 8,  restSec: 150, region: "upper" },
        { name: "Flat DB press",                sets: 3, repLow: 8,  repHigh: 10, restSec: 150, region: "upper" },
        { name: "Weighted dips (or machine press)", sets: 3, repLow: 8, repHigh: 12, restSec: 90, region: "upper" },
        { name: "Cable fly",                     sets: 3, repLow: 12, repHigh: 15, restSec: 90,  region: "upper" },
        { name: "Overhead triceps extension",    sets: 3, repLow: 10, repHigh: 12, restSec: 90,  region: "upper" },
        { name: "Rope pushdown",                 sets: 3, repLow: 12, repHigh: 15, restSec: 90,  region: "upper" }
      ]
    },
    {
      name: "Day 2 — Back + Biceps",
      exercises: [
        { name: "Weighted pull-up or lat pulldown", sets: 4, repLow: 6,  repHigh: 10, restSec: 150, region: "upper" },
        { name: "Chest-supported row or T-bar row", sets: 4, repLow: 8,  repHigh: 10, restSec: 150, region: "upper" },
        { name: "Single-arm DB row",             sets: 3, repLow: 10, repHigh: 12, restSec: 90,  region: "upper" },
        { name: "Straight-arm pulldown",         sets: 3, repLow: 12, repHigh: 15, restSec: 90,  region: "upper" },
        { name: "Face pull",                     sets: 3, repLow: 15, repHigh: 20, restSec: 60,  region: "upper" },
        { name: "Incline DB curl",               sets: 3, repLow: 10, repHigh: 12, restSec: 90,  region: "upper" },
        { name: "Hammer curl",                   sets: 3, repLow: 10, repHigh: 12, restSec: 90,  region: "upper" }
      ]
    },
    {
      name: "Day 3 — Legs",
      exercises: [
        { name: "Squat (back or hack)",          sets: 4, repLow: 6,  repHigh: 8,  restSec: 150, region: "lower" },
        { name: "Romanian deadlift",             sets: 3, repLow: 8,  repHigh: 10, restSec: 150, region: "lower" },
        { name: "Leg press",                     sets: 3, repLow: 10, repHigh: 12, restSec: 90,  region: "lower" },
        { name: "Leg curl",                      sets: 3, repLow: 12, repHigh: 15, restSec: 90,  region: "lower" },
        { name: "Leg extension",                 sets: 3, repLow: 12, repHigh: 15, restSec: 90,  region: "lower" },
        { name: "Standing calf raise",           sets: 4, repLow: 10, repHigh: 15, restSec: 90,  region: "lower" }
      ]
    },
    {
      name: "Day 4 — Shoulders + Arms",
      exercises: [
        { name: "Overhead press",                sets: 4, repLow: 6,  repHigh: 8,  restSec: 150, region: "upper" },
        { name: "Lateral raise",                 sets: 4, repLow: 12, repHigh: 20, restSec: 150, region: "upper" },
        { name: "Rear delt fly",                 sets: 3, repLow: 15, repHigh: 20, restSec: 60,  region: "upper" },
        { name: "Shrug",                         sets: 4, repLow: 10, repHigh: 12, restSec: 90,  region: "upper" },
        { name: "EZ-bar curl",                   sets: 3, repLow: 8,  repHigh: 10, restSec: 90,  region: "upper" },
        { name: "Skull crusher",                 sets: 3, repLow: 10, repHigh: 12, restSec: 90,  region: "upper" },
        { name: "Cable curl / pushdown superset", sets: 2, repLow: 15, repHigh: 15, restSec: 60, region: "upper", note: "2 rounds, 15 each" }
      ]
    },
    {
      name: "Day 5 — Upper Volume",
      exercises: [
        { name: "Flat barbell bench",            sets: 4, repLow: 6,  repHigh: 8,  restSec: 150, region: "upper" },
        { name: "Barbell row",                   sets: 4, repLow: 8,  repHigh: 10, restSec: 150, region: "upper" },
        { name: "Machine or DB shoulder press",  sets: 3, repLow: 10, repHigh: 12, restSec: 90,  region: "upper" },
        { name: "Close-grip lat pulldown",       sets: 3, repLow: 10, repHigh: 12, restSec: 90,  region: "upper" },
        { name: "Lateral raise",                 sets: 3, repLow: 15, repHigh: 20, restSec: 60,  region: "upper" },
        { name: "Cable fly",                     sets: 3, repLow: 12, repHigh: 15, restSec: 90,  region: "upper" },
        { name: "Biceps + triceps finisher",     sets: 3, repLow: 12, repHigh: 12, restSec: 90,  region: "upper", note: "12 each" }
      ]
    },
    {
      name: "Day 6 — Spiderman (AMRAP)",
      type: "amrap",
      durationSec: 1200,
      note: "As many rounds as possible in 20 minutes, performed continuously.",
      movements: [
        { name: "Pull-ups",   reps: 5 },
        { name: "Push-ups",   reps: 10 },
        { name: "Air squats", reps: 15 }
      ]
    }
  ]
};
