/* Lift — offline workout tracker. Vanilla JS, no build step. */
(function () {
  "use strict";

  /* ============================================================
   * Storage layer
   * ========================================================== */
  const KEYS = {
    history: "gym.history",   // array of completed sessions
    bw: "gym.bodyweight",     // array of { date, weight }
    state: "gym.state",       // { lastCompletedDayIndex, weekCounter, deloadDismissedWeek }
    active: "gym.active"      // in-progress session (survives reload)
  };

  const Store = {
    read(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    write(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); }
      catch (e) { alert("Could not save — storage may be full."); }
    }
  };

  function getState() {
    return Store.read(KEYS.state, {
      lastCompletedDayIndex: null,
      weekCounter: 1,
      deloadDismissedWeek: null
    });
  }
  function setState(s) { Store.write(KEYS.state, s); }
  function getHistory() { return Store.read(KEYS.history, []); }
  function setHistory(h) { Store.write(KEYS.history, h); }
  function getBodyweight() { return Store.read(KEYS.bw, []); }
  function setBodyweight(b) { Store.write(KEYS.bw, b); }
  function getActive() { return Store.read(KEYS.active, null); }
  function setActive(a) {
    if (a) Store.write(KEYS.active, a);
    else localStorage.removeItem(KEYS.active);
  }

  /* ============================================================
   * Helpers
   * ========================================================== */
  const $ = (sel, el) => (el || document).querySelector(sel);
  const el = (tag, attrs, kids) => {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(c => {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  function fmtDateShort(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function fmtDuration(sec) {
    const m = Math.round(sec / 60);
    if (m < 60) return m + " min";
    return Math.floor(m / 60) + "h " + (m % 60) + "m";
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }
  function epley(weight, reps) {
    if (!weight || !reps) return 0;
    return weight * (1 + reps / 30);
  }
  function num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }

  /* ============================================================
   * Exercise history lookups + progression analysis
   * ========================================================== */

  // Most recent completed session entry for a given exercise name.
  function lastSessionForExercise(name, excludeId) {
    const hist = getHistory();
    for (let i = hist.length - 1; i >= 0; i--) {
      if (excludeId && hist[i].id === excludeId) continue;
      const exs = hist[i].exercises;
      if (!exs) continue; // AMRAP sessions have no exercises
      const ex = exs.find(e => e.name === name && e.sets.length);
      if (ex) return { session: hist[i], ex };
    }
    return null;
  }

  // Every session entry for an exercise, oldest -> newest, only those with sets.
  function allSessionsForExercise(name) {
    return getHistory()
      .filter(s => s.exercises && s.exercises.some(e => e.name === name && e.sets.length))
      .map(s => ({ date: s.date, ex: s.exercises.find(e => e.name === name && e.sets.length) }));
  }

  // Most recent completed AMRAP session for a given day name.
  function lastAmrapForDay(dayName, excludeId) {
    const hist = getHistory();
    for (let i = hist.length - 1; i >= 0; i--) {
      if (excludeId && hist[i].id === excludeId) continue;
      if (hist[i].type === "amrap" && hist[i].dayName === dayName) return hist[i];
    }
    return null;
  }

  function workSetsSummary(sets) { return sets.map(s => s.reps).join("×"); }

  // Analyze double-progression state for an exercise definition.
  function analyzeProgression(exDef) {
    const sessions = allSessionsForExercise(exDef.name);
    const result = { addWeight: null, stalled: false };
    if (!sessions.length) return result;

    const last = sessions[sessions.length - 1];
    const lastSets = last.ex.sets;

    // Hit top of range on ALL work sets -> suggest adding weight.
    if (lastSets.length && lastSets.every(s => s.reps >= exDef.repHigh)) {
      const inc = exDef.region === "lower" ? 10 : 5;
      result.addWeight = { inc, summary: workSetsSummary(lastSets), weight: maxWeight(lastSets) };
    }

    // Failed to hit bottom of range two sessions in a row -> stalled.
    if (sessions.length >= 2) {
      const failedBottom = (s) => s.ex.sets.some(x => x.reps < exDef.repLow);
      const a = sessions[sessions.length - 1], b = sessions[sessions.length - 2];
      if (failedBottom(a) && failedBottom(b)) result.stalled = true;
    }
    return result;
  }

  function maxWeight(sets) { return sets.reduce((m, s) => Math.max(m, num(s.weight)), 0); }
  function topSet(sets) {
    // Set with the highest estimated 1RM.
    return sets.reduce((best, s) =>
      (epley(num(s.weight), num(s.reps)) > epley(num(best.weight), num(best.reps)) ? s : best), sets[0]);
  }

  /* ============================================================
   * Rest timer
   * ========================================================== */
  const Timer = {
    total: 0, remaining: 0, interval: null, onEnd: null,
    start(seconds) {
      this.stop();
      this.total = seconds;
      this.remaining = seconds;
      this.tick();
      this.interval = setInterval(() => {
        this.remaining -= 1;
        if (this.remaining <= 0) {
          this.remaining = 0;
          this.finish();
        }
        this.tick();
      }, 1000);
      renderTopbar();
    },
    add(seconds) {
      if (this.interval == null && this.remaining <= 0) return;
      this.remaining += seconds;
      this.total = Math.max(this.total, this.remaining);
      this.tick();
    },
    skip() { this.stop(); this.remaining = 0; this.total = 0; renderTopbar(); },
    finish() {
      clearInterval(this.interval); this.interval = null;
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    },
    stop() { if (this.interval) { clearInterval(this.interval); this.interval = null; } },
    tick() {
      const bar = document.getElementById("timerbar");
      if (!bar) return;
      const time = $(".time", bar), prog = $(".prog", bar);
      if (time) time.textContent = fmtClock(this.remaining);
      if (prog && this.total) prog.style.width = (100 * this.remaining / this.total) + "%";
      bar.classList.toggle("done", this.remaining <= 0 && this.total > 0);
    }
  };

  /* ============================================================
   * AMRAP clock — a continuous count-down for circuit days.
   * Driven off the session start time, so a reload resumes correctly.
   * ========================================================== */
  let amrapInterval = null;
  function startAmrapClock(a) {
    stopAmrapClock();
    const update = () => {
      const elapsed = Math.floor((Date.now() - a.startTime) / 1000);
      const remaining = Math.max(0, a.durationSec - elapsed);
      const clock = document.getElementById("amrapclock");
      const prog = document.getElementById("amrapprog");
      const lbl = document.getElementById("amraplbl");
      if (clock) clock.textContent = fmtClock(remaining);
      if (prog) prog.style.width = (100 * remaining / a.durationSec) + "%";
      if (remaining <= 0) {
        stopAmrapClock();
        if (clock) clock.textContent = "0:00";
        if (lbl) lbl.textContent = "Time — finish up";
        if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 300]);
      }
    };
    update();
    amrapInterval = setInterval(update, 1000);
  }
  function stopAmrapClock() { if (amrapInterval) { clearInterval(amrapInterval); amrapInterval = null; } }

  /* ============================================================
   * Router / screen state
   * ========================================================== */
  const APP = document.getElementById("app");
  const NAV = document.getElementById("nav");
  let screen = "today";
  let todayDayIndex = null; // override selection on Today

  function go(name) { screen = name; render(); window.scrollTo(0, 0); }

  function nextDayIndex() {
    const s = getState();
    if (s.lastCompletedDayIndex == null) return 0;
    return (s.lastCompletedDayIndex + 1) % PROGRAM.days.length;
  }

  function render() {
    const active = getActive();
    if (active) screen = "session";

    NAV.classList.toggle("hidden", screen === "session");
    APP.classList.toggle("no-nav", screen === "session");
    Array.from(NAV.children).forEach(b =>
      b.classList.toggle("active", b.dataset.screen === screen));

    APP.innerHTML = "";
    if (screen === "today") renderToday();
    else if (screen === "session") renderSession();
    else if (screen === "progress") renderProgress();
    else if (screen === "history") renderHistory();
    else if (screen === "settings") renderSettings();

    renderTopbar();
  }

  /* ============================================================
   * Top bar: deload banner + rest timer
   * ========================================================== */
  function renderTopbar() {
    const bar = document.getElementById("topbar");
    bar.innerHTML = "";
    const state = getState();

    // Deload banner (weeks 7 & 8), dismissible.
    const wk = state.weekCounter;
    if ((wk === 7 || wk === 8) && state.deloadDismissedWeek !== wk) {
      bar.appendChild(el("div", { class: "banner deload" }, [
        el("span", { text: "Deload week " + wk + " — cut your sets in half, keep the weight." }),
        el("button", {
          text: "Dismiss",
          onclick: () => { const s = getState(); s.deloadDismissedWeek = wk; setState(s); renderTopbar(); }
        })
      ]));
    }

    // Rest timer bar — only during a strength session (AMRAP has its own clock).
    const act = getActive();
    if (screen === "session" && (!act || act.type !== "amrap") && Timer.total > 0) {
      const wrap = el("div", { id: "timerwrap" });
      const done = Timer.remaining <= 0;
      const tb = el("div", { id: "timerbar", class: done ? "done" : "" }, [
        el("div", {}, [
          el("div", { class: "lbl", text: done ? "Rest done" : "Rest" }),
          el("div", { class: "time mono", text: fmtClock(Timer.remaining) })
        ]),
        el("div", { class: "spacer" }),
        el("button", { class: "btn-sm", text: "+30s", onclick: () => Timer.add(30) }),
        el("button", { class: "btn-sm", text: done ? "Clear" : "Skip", onclick: () => Timer.skip() }),
        el("div", { class: "prog" })
      ]);
      wrap.appendChild(tb);
      bar.appendChild(wrap);
      if (Timer.total) $(".prog", tb).style.width = (100 * Timer.remaining / Timer.total) + "%";
    }
  }

  /* ============================================================
   * Screen: Today
   * ========================================================== */
  function renderToday() {
    const dayIdx = todayDayIndex != null ? todayDayIndex : nextDayIndex();
    const day = PROGRAM.days[dayIdx];
    const state = getState();

    APP.appendChild(el("div", { class: "screen-head" }, [
      el("h1", { text: "Today" }),
      el("div", { class: "dim small", text: "Week " + state.weekCounter })
    ]));

    // Day picker chips
    const picker = el("div", { class: "day-pick" });
    PROGRAM.days.forEach((d, i) => {
      picker.appendChild(el("button", {
        class: "day-chip" + (i === dayIdx ? " active" : ""),
        text: "Day " + (i + 1),
        onclick: () => { todayDayIndex = i; render(); }
      }));
    });
    APP.appendChild(picker);

    APP.appendChild(el("h2", { text: day.name, class: "mb" }));

    if (day.type === "amrap") {
      renderAmrapToday(day);
      APP.appendChild(el("button", {
        class: "btn-primary", text: "Start Workout",
        onclick: () => startWorkout(dayIdx)
      }));
      return;
    }

    // Exercise list with target + last-time + progression prompts
    const card = el("div", { class: "card" });
    day.exercises.forEach(exDef => {
      const last = lastSessionForExercise(exDef.name);
      const prog = analyzeProgression(exDef);

      const line = el("div", { class: "ex-line" }, [
        el("div", {}, [
          el("div", { class: "ex-name", text: exDef.name }),
          el("div", {
            class: "ex-meta",
            text: exDef.sets + " × " + exDef.repLow + "–" + exDef.repHigh +
              (exDef.note ? " · " + exDef.note : "")
          })
        ]),
        el("div", { class: "ex-last", text: last ? lastText(last.ex) : "—" })
      ]);
      card.appendChild(line);

      if (prog.addWeight) {
        card.appendChild(el("div", {
          class: "prompt up",
          text: "Add " + prog.addWeight.inc + " lb — you hit " + prog.addWeight.summary + " last time."
        }));
      } else if (prog.stalled) {
        card.appendChild(el("div", {
          class: "prompt stall",
          text: "Stalled 2 sessions — hold this weight or deload 10%."
        }));
      }
    });
    APP.appendChild(card);

    APP.appendChild(el("button", {
      class: "btn-primary", text: "Start Workout",
      onclick: () => startWorkout(dayIdx)
    }));
  }

  function renderAmrapToday(day) {
    const card = el("div", { class: "card" });
    card.appendChild(el("div", { class: "ex-meta mb", text: day.note || "As many rounds as possible." }));
    card.appendChild(el("div", { class: "field-label", text: "One round · " + fmtClock(day.durationSec) + " cap" }));
    day.movements.forEach(m => card.appendChild(el("div", { class: "ex-line" }, [
      el("div", { class: "ex-name", text: m.name }),
      el("div", { class: "ex-last", text: m.reps + " reps" })
    ])));
    const last = lastAmrapForDay(day.name);
    card.appendChild(el("div", { class: "ex-meta mt", text: last
      ? "Last time: " + last.rounds + " rounds" + (last.extraReps ? " +" + last.extraReps + " reps" : "") + " · " + fmtDate(last.date)
      : "No history yet" }));
    APP.appendChild(card);
  }

  function lastText(ex) {
    if (!ex.sets.length) return "—";
    const w = maxWeight(ex.sets);
    return w + " lb · " + workSetsSummary(ex.sets);
  }

  /* ============================================================
   * Active session
   * ========================================================== */
  function startWorkout(dayIdx) {
    const day = PROGRAM.days[dayIdx];
    let active;
    if (day.type === "amrap") {
      active = {
        id: "s" + Date.now(), date: new Date().toISOString(), startTime: Date.now(),
        dayIndex: dayIdx, dayName: day.name, type: "amrap",
        durationSec: day.durationSec, note: day.note || "",
        movements: day.movements.map(m => ({ name: m.name, reps: m.reps })),
        repsPerRound: day.movements.reduce((s, m) => s + m.reps, 0),
        rounds: 0, extraReps: 0, notes: ""
      };
    } else {
      active = {
        id: "s" + Date.now(), date: new Date().toISOString(), startTime: Date.now(),
        dayIndex: dayIdx, dayName: day.name, type: "strength", currentExerciseIndex: 0,
        exercises: day.exercises.map(d => ({
          name: d.name, targetSets: d.sets, repLow: d.repLow, repHigh: d.repHigh,
          restSec: d.restSec, region: d.region, note: d.note || "",
          sets: [], notes: "", planned: true
        }))
      };
    }
    setActive(active);
    todayDayIndex = null;
    Timer.skip();
    stopAmrapClock();
    go("session");
  }

  function saveActive(a) { setActive(a); }

  function renderSession() {
    const a = getActive();
    if (!a) { go("today"); return; }
    if (a.type === "amrap") { renderAmrapSession(a); return; }
    const idx = a.currentExerciseIndex;
    const ex = a.exercises[idx];
    const exDef = { name: ex.name, repLow: ex.repLow, repHigh: ex.repHigh, region: ex.region };
    const prev = lastSessionForExercise(ex.name, a.id);
    const prog = analyzeProgression(exDef);

    // Header: day + finish
    APP.appendChild(el("div", { class: "session-top" }, [
      el("div", {}, [
        el("div", { class: "ex-counter", text: a.dayName }),
        el("div", { class: "ex-counter", text: "Exercise " + (idx + 1) + " of " + a.exercises.length })
      ]),
      el("button", { class: "btn-sm", text: "Finish", onclick: finishWorkout })
    ]));

    // Progression prompt for this exercise
    if (prog.addWeight) {
      APP.appendChild(el("div", {
        class: "prompt up mb",
        text: "Add " + prog.addWeight.inc + " lb — you hit " + prog.addWeight.summary + " last time."
      }));
    } else if (prog.stalled) {
      APP.appendChild(el("div", {
        class: "prompt stall mb",
        text: "Stalled 2 sessions — hold this weight or deload 10%."
      }));
    }

    APP.appendChild(el("div", { class: "ex-title", text: ex.name }));
    APP.appendChild(el("div", {
      class: "ex-target",
      text: "Target: " + ex.targetSets + " sets × " + ex.repLow + "–" + ex.repHigh + " reps" +
        (ex.note ? " · " + ex.note : "")
    }));

    // Logged sets so far
    const setlist = el("div", { class: "setlist" });
    ex.sets.forEach((s, i) => {
      setlist.appendChild(el("div", { class: "set-row done" }, [
        el("span", { class: "idx", text: "#" + (i + 1) }),
        el("span", { class: "val", text: s.weight + " lb × " + s.reps }),
        el("span", { class: "e1rm", text: "~" + Math.round(epley(num(s.weight), num(s.reps))) + " 1RM" }),
        el("button", {
          class: "btn-sm btn-ghost", text: "✕", "aria-label": "remove set",
          onclick: () => { ex.sets.splice(i, 1); saveActive(a); render(); }
        })
      ]));
    });
    APP.appendChild(setlist);

    // Ghost values: carry forward this session's last set, else last session's
    // matching set — so "Log" without editing repeats what makes sense.
    let ghostW = "", ghostR = "";
    if (ex.sets.length) {
      const carry = ex.sets[ex.sets.length - 1];
      ghostW = carry.weight; ghostR = carry.reps;
    } else if (prev) {
      const ps = prev.ex.sets[0];
      ghostW = ps.weight; ghostR = ps.reps;
    }

    // Log inputs with steppers
    const wInput = stepperInput("Weight (lb)", ghostW, 5, "weight");
    const rInput = stepperInput("Reps", ghostR, 1, "reps");
    APP.appendChild(el("div", { class: "log-grid" }, [wInput.wrap, rInput.wrap]));

    APP.appendChild(el("button", {
      class: "btn-primary", text: "Log Set " + (ex.sets.length + 1),
      onclick: () => {
        const w = wInput.value(), r = rInput.value();
        if (!w || !r) { alert("Enter a weight and reps."); return; }
        ex.sets.push({ weight: w, reps: r });
        saveActive(a);                 // write after EVERY set
        Timer.start(ex.restSec);       // auto-start rest timer
        render();
      }
    }));

    // Extra set / notes
    APP.appendChild(el("div", { class: "nav-arrows" }, [
      el("button", {
        class: "btn-ghost", text: "＋ Extra set",
        onclick: () => { /* extra set = just log another; nudge focus */ wInput.input.focus(); }
      }),
      el("button", {
        class: "btn-ghost", text: ex.notes ? "Notes •" : "Notes",
        onclick: () => toggleNotes(a, idx)
      })
    ]));
    const notesWrap = el("div", { id: "notesWrap", class: ex._notesOpen ? "" : "hidden" });
    notesWrap.appendChild(el("textarea", {
      class: "inline-input", placeholder: "Notes for this exercise…",
      oninput: (e) => { ex.notes = e.target.value; saveActive(a); }
    }, ex.notes));
    APP.appendChild(notesWrap);
    if (ex._notesOpen) $("#notesWrap textarea").value = ex.notes;

    APP.appendChild(el("div", { class: "divider" }));

    // Prev / Next navigation
    APP.appendChild(el("div", { class: "nav-arrows" }, [
      el("button", {
        text: "← Prev", disabled: idx === 0 ? "" : null,
        onclick: () => { if (idx > 0) { a.currentExerciseIndex--; saveActive(a); render(); } }
      }),
      el("button", {
        text: "Next →", disabled: idx === a.exercises.length - 1 ? "" : null,
        onclick: () => { if (idx < a.exercises.length - 1) { a.currentExerciseIndex++; saveActive(a); render(); } }
      })
    ]));

    // Jump-to-exercise list
    APP.appendChild(el("h2", { text: "Jump to", class: "mt mb" }));
    const jump = el("div", { class: "jump-list" });
    a.exercises.forEach((e, i) => {
      jump.appendChild(el("button", {
        class: "jump-item" + (i === idx ? " current" : ""),
        onclick: () => { a.currentExerciseIndex = i; saveActive(a); render(); }
      }, [
        el("span", { text: (i + 1) + ". " + e.name }),
        el("span", { class: "cnt", text: e.sets.length + "/" + e.targetSets })
      ]));
    });
    APP.appendChild(jump);

    // Add unplanned exercise
    APP.appendChild(el("button", {
      class: "btn-ghost btn-block mt", text: "＋ Add unplanned exercise",
      onclick: () => addUnplannedExercise(a)
    }));

    APP.appendChild(el("button", {
      class: "btn-danger btn-block mt", text: "Discard workout",
      onclick: () => { if (confirm("Discard this workout? Logged sets will be lost.")) { setActive(null); Timer.skip(); go("today"); } }
    }));
  }

  function toggleNotes(a, idx) {
    a.exercises[idx]._notesOpen = !a.exercises[idx]._notesOpen;
    saveActive(a); // persist so the re-render (which re-reads storage) keeps it open
    render();
  }

  function addUnplannedExercise(a) {
    const name = prompt("Exercise name:");
    if (!name) return;
    a.exercises.push({
      name: name.trim(), targetSets: 3, repLow: 8, repHigh: 12,
      restSec: 90, region: "upper", note: "", sets: [], notes: "", planned: false
    });
    a.currentExerciseIndex = a.exercises.length - 1;
    saveActive(a);
    render();
  }

  function stepperInput(label, ghost, step, kind, onChange) {
    const input = el("input", {
      type: "number", inputmode: "decimal", step: String(step),
      placeholder: ghost === "" || ghost == null ? "" : String(ghost)
    });
    const fire = () => { if (onChange) onChange(input.value !== "" ? num(input.value) : 0); };
    const dec = el("button", { text: "–", "aria-label": "decrease", onclick: () => {
      const base = input.value !== "" ? num(input.value) : (ghost !== "" ? num(ghost) : 0);
      input.value = Math.max(0, base - step); fire();
    }});
    const inc = el("button", { text: "+", "aria-label": "increase", onclick: () => {
      const base = input.value !== "" ? num(input.value) : (ghost !== "" ? num(ghost) : 0);
      input.value = base + step; fire();
    }});
    if (onChange) input.addEventListener("input", fire);
    const wrap = el("div", {}, [
      el("div", { class: "field-label", text: label }),
      el("div", { class: "stepper" }, [dec, input, inc])
    ]);
    return {
      wrap, input,
      value: () => input.value !== "" ? num(input.value) : (ghost !== "" && ghost != null ? num(ghost) : 0)
    };
  }

  function finishWorkout() {
    const a = getActive();
    if (!a) return;
    if (a.type === "amrap") { finishAmrap(a); return; }
    const logged = a.exercises.filter(e => e.sets.length);
    if (!logged.length) {
      if (!confirm("No sets logged. Discard this workout?")) return;
      setActive(null); Timer.skip(); go("today"); return;
    }
    if (!confirm("Finish and save this workout?")) return;

    const durationSec = Math.round((Date.now() - a.startTime) / 1000);
    const session = {
      id: a.id, date: a.date, dayIndex: a.dayIndex, dayName: a.dayName,
      durationSec,
      exercises: logged.map(e => ({
        name: e.name, targetSets: e.targetSets, repLow: e.repLow, repHigh: e.repHigh,
        region: e.region, sets: e.sets, notes: e.notes || ""
      }))
    };
    const hist = getHistory();
    hist.push(session);
    setHistory(hist);

    // Update week + last-completed state
    commitCompletion(a.dayIndex);
    setActive(null);
    Timer.skip();
    go("history");
  }

  // Last non-AMRAP day drives the week counter (AMRAP days are optional add-ons).
  function lastStrengthDayIndex() {
    let idx = 0;
    PROGRAM.days.forEach((d, i) => { if (d.type !== "amrap") idx = i; });
    return idx;
  }
  function commitCompletion(dayIndex) {
    const state = getState();
    state.lastCompletedDayIndex = dayIndex;
    if (dayIndex === lastStrengthDayIndex()) state.weekCounter += 1; // finished a cycle
    setState(state);
  }

  function renderAmrapSession(a) {
    // Keep the clock running (survives re-renders via element ids; resumes after reload).
    const elapsed = Math.floor((Date.now() - a.startTime) / 1000);
    const remaining = Math.max(0, a.durationSec - elapsed);
    if (!amrapInterval && remaining > 0) startAmrapClock(a);

    APP.appendChild(el("div", { class: "session-top" }, [
      el("div", {}, [
        el("div", { class: "ex-counter", text: a.dayName }),
        el("div", { class: "ex-counter", text: "AMRAP — as many rounds as possible" })
      ]),
      el("button", { class: "btn-sm", text: "Finish", onclick: finishWorkout })
    ]));

    // Big clock
    const done = remaining <= 0;
    APP.appendChild(el("div", { class: "amrap-clock" + (done ? " done" : "") }, [
      el("div", { id: "amraplbl", class: "lbl", text: done ? "Time — finish up" : "Time remaining" }),
      el("div", { id: "amrapclock", class: "time mono", text: fmtClock(remaining) }),
      el("div", { class: "amrap-progwrap" }, [el("div", { id: "amrapprog", class: "amrap-prog", style: "width:" + (100 * remaining / a.durationSec) + "%" })])
    ]));

    // Round counter — the fast one-thumb control
    APP.appendChild(el("div", { class: "amrap-count" }, [
      el("div", { class: "n mono", text: String(a.rounds) }),
      el("div", { class: "l", text: "rounds" })
    ]));
    APP.appendChild(el("button", {
      class: "btn-primary", text: "＋ Round",
      onclick: () => { a.rounds += 1; a.extraReps = 0; saveActive(a); render(); }
    }));
    APP.appendChild(el("div", { class: "nav-arrows" }, [
      el("button", {
        class: "btn-ghost", text: "− Round", disabled: a.rounds === 0 ? "" : null,
        onclick: () => { if (a.rounds > 0) { a.rounds -= 1; saveActive(a); render(); } }
      })
    ]));

    // One round recipe
    const recipe = el("div", { class: "card mt" }, [el("div", { class: "field-label", text: "One round" })]);
    a.movements.forEach(m => recipe.appendChild(el("div", { class: "ex-line" }, [
      el("div", { class: "ex-name", text: m.name }),
      el("div", { class: "ex-last", text: m.reps + " reps" })
    ])));
    APP.appendChild(recipe);

    // Total reps readout (updated live as partial reps change)
    const totalEl = el("div", { class: "tiny dim mt" });
    const paintTotal = () => {
      totalEl.textContent = "Total reps: " + (a.rounds * a.repsPerRound + (a.extraReps || 0)) + " (" + a.repsPerRound + "/round)";
    };

    // Optional partial reps into the current (unfinished) round
    const extra = stepperInput("Partial reps this round", a.extraReps || 0, 1, "reps",
      (v) => { a.extraReps = Math.max(0, v); saveActive(a); paintTotal(); });
    extra.input.value = a.extraReps || 0;
    APP.appendChild(el("div", { class: "mt" }, [extra.wrap]));

    paintTotal();
    APP.appendChild(totalEl);

    // Notes
    APP.appendChild(el("div", { class: "field-label mt", text: "Notes" }));
    const ta = el("textarea", {
      class: "inline-input", placeholder: "Notes for this session…",
      oninput: (e) => { a.notes = e.target.value; saveActive(a); }
    }, a.notes || "");
    APP.appendChild(ta);

    APP.appendChild(el("button", {
      class: "btn-danger btn-block mt", text: "Discard workout",
      onclick: () => { if (confirm("Discard this workout? Logged rounds will be lost.")) { setActive(null); stopAmrapClock(); go("today"); } }
    }));
  }

  function finishAmrap(a) {
    if (!a.rounds && !a.extraReps) {
      if (!confirm("No rounds logged. Discard this workout?")) return;
      setActive(null); stopAmrapClock(); go("today"); return;
    }
    if (!confirm("Finish and save this workout?")) return;
    const elapsed = Math.round((Date.now() - a.startTime) / 1000);
    const session = {
      id: a.id, date: a.date, dayIndex: a.dayIndex, dayName: a.dayName, type: "amrap",
      durationSec: Math.min(a.durationSec, elapsed), plannedDurationSec: a.durationSec,
      rounds: a.rounds, extraReps: a.extraReps || 0,
      movements: a.movements, repsPerRound: a.repsPerRound, notes: a.notes || ""
    };
    const hist = getHistory();
    hist.push(session);
    setHistory(hist);
    commitCompletion(a.dayIndex);
    setActive(null);
    stopAmrapClock();
    go("history");
  }

  /* ============================================================
   * Screen: Progress
   * ========================================================== */
  let progressExercise = null;

  function renderProgress() {
    APP.appendChild(el("div", { class: "screen-head" }, [el("h1", { text: "Progress" })]));

    // ---- Exercise 1RM progress ----
    const names = exerciseNamesWithHistory();
    APP.appendChild(el("h2", { text: "Estimated 1RM" }));
    if (!names.length) {
      APP.appendChild(el("div", { class: "empty", text: "Log a few workouts to see progress." }));
    } else {
      if (!progressExercise || !names.includes(progressExercise)) progressExercise = names[0];
      const select = el("select", { class: "inline-input mb", onchange: (e) => { progressExercise = e.target.value; render(); } });
      names.forEach(n => {
        const o = el("option", { value: n, text: n });
        if (n === progressExercise) o.selected = "selected";
        select.appendChild(o);
      });
      APP.appendChild(select);
      APP.appendChild(renderExerciseProgress(progressExercise));
    }

    APP.appendChild(el("div", { class: "divider" }));

    // ---- Bodyweight ----
    APP.appendChild(el("h2", { text: "Bodyweight" }));
    APP.appendChild(renderBodyweight());

    // ---- Conditioning (AMRAP rounds over time) ----
    const amrap = getHistory().filter(s => s.type === "amrap");
    if (amrap.length) {
      APP.appendChild(el("div", { class: "divider" }));
      APP.appendChild(el("h2", { text: "Conditioning — rounds", class: "mb" }));
      // Group by day name (usually just one AMRAP day).
      const byDay = {};
      amrap.forEach(s => { (byDay[s.dayName] = byDay[s.dayName] || []).push(s); });
      Object.keys(byDay).forEach(dayName => {
        const list = byDay[dayName];
        const pts = list.map((s, i) => ({ x: i, y: s.rounds + (s.extraReps || 0) / (s.repsPerRound || 1) }));
        const best = list.reduce((m, s) => Math.max(m, s.rounds), 0);
        APP.appendChild(el("div", { class: "small dim mb", text: dayName }));
        APP.appendChild(lineChart(pts, { labels: list.map(s => fmtDateShort(s.date)), unit: "" }));
        APP.appendChild(el("div", { class: "pb-grid" }, [
          el("div", { class: "pb-box" }, [
            el("div", { class: "n mono", text: String(best) }),
            el("div", { class: "l", text: "Best rounds" })
          ]),
          el("div", { class: "pb-box" }, [
            el("div", { class: "n mono", text: String(list.length) }),
            el("div", { class: "l", text: "Sessions" })
          ])
        ]));
      });
    }
  }

  function exerciseNamesWithHistory() {
    const set = new Set();
    getHistory().forEach(s => (s.exercises || []).forEach(e => { if (e.sets.length) set.add(e.name); }));
    // Order by program order, then extras
    const ordered = [];
    PROGRAM.days.forEach(d => (d.exercises || []).forEach(e => { if (set.has(e.name) && !ordered.includes(e.name)) ordered.push(e.name); }));
    set.forEach(n => { if (!ordered.includes(n)) ordered.push(n); });
    return ordered;
  }

  function renderExerciseProgress(name) {
    const sessions = allSessionsForExercise(name);
    const points = sessions.map(s => {
      const t = topSet(s.ex.sets);
      return { date: s.date, y: epley(num(t.weight), num(t.reps)), w: num(t.weight), r: num(t.reps) };
    });

    const wrap = el("div", {});
    wrap.appendChild(lineChart(points.map((p, i) => ({ x: i, y: p.y })), {
      labels: points.map(p => fmtDateShort(p.date)), unit: ""
    }));

    // Personal bests
    let bestWeight = { w: 0, date: null }, best1rm = { v: 0, date: null };
    sessions.forEach(s => {
      s.ex.sets.forEach(set => {
        const w = num(set.weight), e = epley(w, num(set.reps));
        if (w > bestWeight.w) bestWeight = { w, date: s.date };
        if (e > best1rm.v) best1rm = { v: e, date: s.date };
      });
    });
    wrap.appendChild(el("div", { class: "pb-grid" }, [
      el("div", { class: "pb-box" }, [
        el("div", { class: "n mono", text: bestWeight.w + " lb" }),
        el("div", { class: "l", text: "Heaviest · " + (bestWeight.date ? fmtDate(bestWeight.date) : "—") })
      ]),
      el("div", { class: "pb-box" }, [
        el("div", { class: "n mono", text: Math.round(best1rm.v) + " lb" }),
        el("div", { class: "l", text: "Best est. 1RM · " + (best1rm.date ? fmtDate(best1rm.date) : "—") })
      ])
    ]));
    return wrap;
  }

  /* ---------- Bodyweight ---------- */
  function renderBodyweight() {
    const wrap = el("div", {});
    const bw = getBodyweight().slice().sort((a, b) => a.date.localeCompare(b.date));

    // Entry row
    const input = el("input", { type: "number", inputmode: "decimal", step: "0.1", class: "inline-input", placeholder: "Weight (lb)" });
    const dateInput = el("input", { type: "date", class: "inline-input", value: todayISO() });
    wrap.appendChild(el("div", { class: "log-grid mb" }, [
      el("div", {}, [el("div", { class: "field-label", text: "Date" }), dateInput]),
      el("div", {}, [el("div", { class: "field-label", text: "Weight" }), input])
    ]));
    wrap.appendChild(el("button", {
      class: "btn-primary mb", text: "Log Bodyweight",
      onclick: () => {
        const w = num(input.value);
        if (!w) { alert("Enter a weight."); return; }
        const list = getBodyweight().filter(e => e.date !== dateInput.value);
        list.push({ date: dateInput.value, weight: w });
        setBodyweight(list);
        render();
      }
    }));

    if (!bw.length) {
      wrap.appendChild(el("div", { class: "empty", text: "No bodyweight logged yet." }));
      return wrap;
    }

    // 7-day rolling average line + raw points
    const raw = bw.map(e => ({ x: dayNumber(e.date), y: e.weight, date: e.date }));
    const avg = rollingAverage(bw, 7).map(e => ({ x: dayNumber(e.date), y: e.avg }));
    wrap.appendChild(lineChart(
      raw.map(p => ({ x: p.x, y: p.y })),
      { labels: bw.map(e => fmtDateShort(e.date)), overlay: avg, unit: "" }
    ));
    wrap.appendChild(el("div", { class: "tiny dim mb", text: "Dots: daily weight · Line: 7-day average" }));

    // Weekly rate of change (least-squares slope over last 28 days) vs +0.5 target
    const rate = weeklyRate(bw);
    if (rate != null) {
      const inTarget = rate >= 0.25 && rate <= 0.75;
      const cls = inTarget ? "rate-good" : "rate-warn";
      wrap.appendChild(el("div", { class: "card-row" }, [
        el("div", { class: "small dim", text: "Avg weekly change (target +0.5)" }),
        el("span", { class: "rate-pill " + cls, text: (rate >= 0 ? "+" : "") + rate.toFixed(2) + " lb/wk" })
      ]));
    }
    return wrap;
  }

  function dayNumber(iso) { return Math.floor(new Date(iso + "T00:00:00").getTime() / 86400000); }

  function rollingAverage(bw, windowDays) {
    const sorted = bw.slice().sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((e, i) => {
      const cutoff = dayNumber(e.date) - (windowDays - 1);
      const win = sorted.filter((x, j) => j <= i && dayNumber(x.date) >= cutoff);
      const avg = win.reduce((s, x) => s + x.weight, 0) / win.length;
      return { date: e.date, avg };
    });
  }

  function weeklyRate(bw) {
    const sorted = bw.slice().sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 2) return null;
    const lastDay = dayNumber(sorted[sorted.length - 1].date);
    const recent = sorted.filter(e => dayNumber(e.date) >= lastDay - 27);
    if (recent.length < 2) return null;
    // Least-squares slope (lb per day) then ×7
    const xs = recent.map(e => dayNumber(e.date));
    const ys = recent.map(e => e.weight);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num2 = 0, den = 0;
    for (let i = 0; i < n; i++) { num2 += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    if (den === 0) return null;
    return (num2 / den) * 7;
  }

  /* ---------- SVG line chart ---------- */
  function lineChart(points, opts) {
    opts = opts || {};
    const W = 320, H = 160, padL = 34, padR = 10, padT = 12, padB = 22;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("class", "chart");
    svg.setAttribute("preserveAspectRatio", "none");

    const all = points.concat(opts.overlay || []);
    if (!all.length) return svg;
    const ys = all.map(p => p.y);
    const xs = all.map(p => p.x);
    let minY = Math.min(...ys), maxY = Math.max(...ys);
    if (minY === maxY) { minY -= 1; maxY += 1; }
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const rangeX = (maxX - minX) || 1;
    const sx = x => padL + ((x - minX) / rangeX) * (W - padL - padR);
    const sy = y => padT + (1 - (y - minY) / (maxY - minY)) * (H - padT - padB);

    const mk = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      return n;
    };

    // horizontal gridlines + y labels (min, mid, max)
    [minY, (minY + maxY) / 2, maxY].forEach(v => {
      const y = sy(v);
      svg.appendChild(mk("line", { x1: padL, y1: y, x2: W - padR, y2: y, stroke: "#2a2a30", "stroke-width": 1 }));
      const t = mk("text", { x: 2, y: y + 4, fill: "#9a9aa4", "font-size": 10 });
      t.textContent = Math.round(v);
      svg.appendChild(t);
    });

    const toPath = pts => pts.map((p, i) => (i ? "L" : "M") + sx(p.x).toFixed(1) + " " + sy(p.y).toFixed(1)).join(" ");

    // overlay (rolling average) drawn dim behind
    if (opts.overlay && opts.overlay.length) {
      svg.appendChild(mk("path", { d: toPath(opts.overlay), fill: "none", stroke: "#3b82f6", "stroke-width": 2.5, "stroke-linejoin": "round", opacity: 0.9 }));
    }

    // main series
    if (points.length > 1) {
      svg.appendChild(mk("path", { d: toPath(points), fill: "none", stroke: opts.overlay ? "#4b4b55" : "#3b82f6", "stroke-width": opts.overlay ? 1.5 : 2.5, "stroke-linejoin": "round" }));
    }
    points.forEach(p => svg.appendChild(mk("circle", { cx: sx(p.x), cy: sy(p.y), r: opts.overlay ? 2.5 : 3.2, fill: opts.overlay ? "#6b6b75" : "#3b82f6" })));

    // x labels: first & last
    if (opts.labels && opts.labels.length) {
      const first = mk("text", { x: padL, y: H - 6, fill: "#9a9aa4", "font-size": 10 });
      first.textContent = opts.labels[0];
      const last = mk("text", { x: W - padR, y: H - 6, fill: "#9a9aa4", "font-size": 10, "text-anchor": "end" });
      last.textContent = opts.labels[opts.labels.length - 1];
      svg.appendChild(first); svg.appendChild(last);
    }
    return svg;
  }

  /* ============================================================
   * Screen: History
   * ========================================================== */
  let openHistoryId = null;
  let editHistoryId = null;

  function renderHistory() {
    APP.appendChild(el("div", { class: "screen-head" }, [el("h1", { text: "History" })]));
    const hist = getHistory().slice().reverse();
    if (!hist.length) {
      APP.appendChild(el("div", { class: "empty", text: "No completed workouts yet." }));
      return;
    }
    hist.forEach(session => {
      const card = el("div", { class: "card" });
      const open = openHistoryId === session.id;
      const summary = session.type === "amrap"
        ? session.rounds + " rounds" + (session.extraReps ? " +" + session.extraReps : "")
        : (session.exercises || []).reduce((s, e) => s + e.sets.length, 0) + " sets";

      card.appendChild(el("button", {
        class: "hist-item btn-ghost", style: "border:none;background:transparent;padding:4px 0;",
        onclick: () => { openHistoryId = open ? null : session.id; editHistoryId = null; render(); }
      }, [
        el("div", {}, [
          el("div", { text: session.dayName, style: "font-weight:600" }),
          el("div", { class: "meta", text: fmtDate(session.date) + " · " + fmtDuration(session.durationSec) + " · " + summary })
        ]),
        el("div", { class: "dim", text: open ? "▲" : "▼" })
      ]));

      if (open) {
        card.appendChild(el("div", { class: "divider" }));
        if (editHistoryId === session.id) card.appendChild(renderHistoryEdit(session));
        else card.appendChild(session.type === "amrap" ? renderAmrapDetail(session) : renderHistoryDetail(session));
      }
      APP.appendChild(card);
    });
  }

  function renderHistoryDetail(session) {
    const wrap = el("div", {});
    session.exercises.forEach(e => {
      wrap.appendChild(el("div", { class: "mb" }, [
        el("div", { style: "font-weight:600", text: e.name }),
        el("div", { class: "small dim", text: e.sets.map(s => s.weight + "×" + s.reps).join("   ") }),
        e.notes ? el("div", { class: "small dim", text: "Note: " + e.notes }) : null
      ]));
    });
    wrap.appendChild(el("div", { class: "row-btns mt" }, [
      el("button", { class: "btn-sm", text: "Edit", onclick: () => { editHistoryId = session.id; render(); } }),
      el("button", {
        class: "btn-sm btn-danger", text: "Delete",
        onclick: () => {
          if (!confirm("Delete this workout permanently?")) return;
          setHistory(getHistory().filter(s => s.id !== session.id));
          openHistoryId = null; render();
        }
      })
    ]));
    return wrap;
  }

  function renderAmrapEdit(session) {
    const draft = JSON.parse(JSON.stringify(session));
    const wrap = el("div", {});
    const rounds = stepperInput("Rounds", draft.rounds, 1, "reps");
    rounds.input.value = draft.rounds;
    const extra = stepperInput("Extra reps", draft.extraReps || 0, 1, "reps");
    extra.input.value = draft.extraReps || 0;
    wrap.appendChild(el("div", { class: "log-grid" }, [rounds.wrap, extra.wrap]));
    wrap.appendChild(el("div", { class: "row-btns mt" }, [
      el("button", {
        class: "btn-sm btn-primary", text: "Save changes",
        onclick: () => {
          draft.rounds = Math.max(0, num(rounds.input.value));
          draft.extraReps = Math.max(0, num(extra.input.value));
          setHistory(getHistory().map(s => s.id === draft.id ? draft : s));
          editHistoryId = null; render();
        }
      }),
      el("button", { class: "btn-sm", text: "Cancel", onclick: () => { editHistoryId = null; render(); } })
    ]));
    return wrap;
  }

  function renderAmrapDetail(session) {
    const wrap = el("div", {});
    const total = session.rounds * session.repsPerRound + (session.extraReps || 0);
    wrap.appendChild(el("div", { class: "pb-grid mb" }, [
      el("div", { class: "pb-box" }, [
        el("div", { class: "n mono", text: session.rounds + (session.extraReps ? " +" + session.extraReps : "") }),
        el("div", { class: "l", text: "rounds" })
      ]),
      el("div", { class: "pb-box" }, [
        el("div", { class: "n mono", text: String(total) }),
        el("div", { class: "l", text: "total reps" })
      ])
    ]));
    (session.movements || []).forEach(m =>
      wrap.appendChild(el("div", { class: "small dim", text: m.reps + " × " + m.name })));
    if (session.notes) wrap.appendChild(el("div", { class: "small dim mt", text: "Note: " + session.notes }));
    wrap.appendChild(el("div", { class: "row-btns mt" }, [
      el("button", { class: "btn-sm", text: "Edit", onclick: () => { editHistoryId = session.id; render(); } }),
      el("button", {
        class: "btn-sm btn-danger", text: "Delete",
        onclick: () => {
          if (!confirm("Delete this workout permanently?")) return;
          setHistory(getHistory().filter(s => s.id !== session.id));
          openHistoryId = null; render();
        }
      })
    ]));
    return wrap;
  }

  function renderHistoryEdit(session) {
    if (session.type === "amrap") return renderAmrapEdit(session);
    // Work on a deep copy; commit on save.
    const draft = JSON.parse(JSON.stringify(session));
    const wrap = el("div", {});
    draft.exercises.forEach((e, ei) => {
      const box = el("div", { class: "mb" }, [el("div", { style: "font-weight:600", text: e.name })]);
      e.sets.forEach((s, si) => {
        const wIn = el("input", { type: "number", inputmode: "decimal", step: "5", class: "inline-input", value: s.weight });
        const rIn = el("input", { type: "number", inputmode: "numeric", step: "1", class: "inline-input", value: s.reps });
        wIn.addEventListener("input", () => s.weight = num(wIn.value));
        rIn.addEventListener("input", () => s.reps = num(rIn.value));
        box.appendChild(el("div", { class: "set-edit-row" }, [
          el("span", { class: "idx", text: "#" + (si + 1) }),
          wIn, el("span", { class: "dim", text: "×" }), rIn,
          el("button", { class: "x btn-danger", text: "✕", onclick: () => { e.sets.splice(si, 1); commitEditRedraw(draft); } })
        ]));
      });
      wrap.appendChild(box);
    });
    wrap.appendChild(el("div", { class: "row-btns mt" }, [
      el("button", {
        class: "btn-sm btn-primary", text: "Save changes",
        onclick: () => {
          draft.exercises = draft.exercises.filter(e => e.sets.length);
          const hist = getHistory().map(s => s.id === draft.id ? draft : s);
          setHistory(hist);
          editHistoryId = null; render();
        }
      }),
      el("button", { class: "btn-sm", text: "Cancel", onclick: () => { editHistoryId = null; render(); } })
    ]));
    return wrap;

    function commitEditRedraw(d) {
      // Re-render edit view against the in-progress draft by stashing it.
      const hist = getHistory().map(s => s.id === d.id ? d : s);
      // Do not persist yet visually differing; simplest is to persist removed set immediately.
      setHistory(hist);
      render();
    }
  }

  /* ============================================================
   * Screen: Settings (export / import / week counter)
   * ========================================================== */
  function renderSettings() {
    APP.appendChild(el("div", { class: "screen-head" }, [el("h1", { text: "Settings" })]));
    const state = getState();

    // Week counter
    APP.appendChild(el("div", { class: "card" }, [
      el("div", { class: "card-row" }, [
        el("div", {}, [
          el("div", { text: "Training week", style: "font-weight:600" }),
          el("div", { class: "small dim", text: "Deload banner shows on weeks 7 & 8" })
        ]),
        el("div", { class: "mono", text: String(state.weekCounter), style: "font-size:24px;font-weight:700" })
      ]),
      el("div", { class: "row-btns mt" }, [
        el("button", { class: "btn-sm", text: "− Week", onclick: () => { const s = getState(); s.weekCounter = Math.max(1, s.weekCounter - 1); s.deloadDismissedWeek = null; setState(s); render(); } }),
        el("button", { class: "btn-sm", text: "+ Week", onclick: () => { const s = getState(); s.weekCounter += 1; s.deloadDismissedWeek = null; setState(s); render(); } }),
        el("button", { class: "btn-sm btn-ghost", text: "Reset to 1", onclick: () => { const s = getState(); s.weekCounter = 1; s.deloadDismissedWeek = null; setState(s); render(); } })
      ])
    ]));

    // Export / Import
    APP.appendChild(el("div", { class: "card" }, [
      el("div", { text: "Your data", style: "font-weight:600", class: "mb" }),
      el("div", { class: "small dim mb", text: "Everything is stored on this device only. Back it up regularly." }),
      el("button", { class: "btn-block", text: "Export data (JSON)", onclick: exportData }),
      el("button", { class: "btn-block", text: "Import data (JSON)", onclick: importData })
    ]));

    // Danger zone
    APP.appendChild(el("div", { class: "card" }, [
      el("button", {
        class: "btn-danger btn-block", text: "Erase all data",
        onclick: () => {
          if (!confirm("Erase ALL workouts, bodyweight and settings on this device? This cannot be undone.")) return;
          if (!confirm("Really erase everything? Export first if unsure.")) return;
          [KEYS.history, KEYS.bw, KEYS.state, KEYS.active].forEach(k => localStorage.removeItem(k));
          render();
        }
      })
    ]));

    APP.appendChild(el("div", { class: "tiny dim center mt", text: "Lift · offline workout tracker" }));
  }

  function exportData() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      history: getHistory(),
      bodyweight: getBodyweight(),
      state: getState()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: "lift-backup-" + todayISO() + ".json" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importData() {
    const picker = el("input", { type: "file", accept: "application/json,.json", class: "hidden" });
    picker.addEventListener("change", () => {
      const file = picker.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let data;
        try { data = JSON.parse(reader.result); }
        catch (e) { alert("That file isn't valid JSON."); return; }
        if (!data || (!data.history && !data.bodyweight)) { alert("This doesn't look like a Lift backup."); return; }
        if (!confirm("Import will OVERWRITE all current data on this device. Continue?")) return;
        if (Array.isArray(data.history)) setHistory(data.history);
        if (Array.isArray(data.bodyweight)) setBodyweight(data.bodyweight);
        if (data.state) setState(data.state);
        setActive(null);
        alert("Import complete.");
        go("today");
      };
      reader.readAsText(file);
    });
    document.body.appendChild(picker); picker.click();
    setTimeout(() => picker.remove(), 100);
  }

  /* ============================================================
   * Boot
   * ========================================================== */
  NAV.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-btn");
    if (!btn) return;
    if (getActive()) { render(); return; } // stay in session
    go(btn.dataset.screen);
  });

  // Register service worker for offline use.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  render();
})();
