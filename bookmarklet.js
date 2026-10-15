(async function () {
  /* index.html swaps in its own address when it builds the bookmark; this is
     the fallback if the file is used on its own. */
  var SITE = "https://neilshah2026.github.io/canvas-tracker/";
  var DAYS = 60;

  if (!/instructure\.com$/i.test(location.hostname)) {
    alert("Run this from your Canvas tab (a *.instructure.com page), then try again.");
    return;
  }

  var box = document.createElement("div");
  box.style.cssText = "position:fixed;z-index:2147483647;top:16px;right:16px;background:#17594F;color:#fff;font:14px/1.4 system-ui,sans-serif;padding:12px 16px;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.3);max-width:300px";
  box.textContent = "Reading your Canvas…";
  document.body.appendChild(box);
  var say = function (m) { box.textContent = m; };

  var get = async function (u) {
    var r = await fetch(u, { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(u + " returned " + r.status);
    var t = await r.text();
    return JSON.parse(t.replace(/^while\(1\);/, ""));
  };

  var textOf = function (html) {
    var d = document.createElement("div");
    d.innerHTML = html || "";
    d.querySelectorAll("script,style").forEach(function (n) { n.remove(); });
    return d.innerText.replace(/ /g, " ").replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);
  };

  try {
    say("Loading your courses…");
    var courses = await get("/api/v1/courses?enrollment_state=active&include[]=term&include[]=total_scores&per_page=100");

    var start = new Date();
    var end = new Date(Date.now() + DAYS * 864e5);
    say("Loading what's coming up…");
    var planner = await get("/api/v1/planner/items?start_date=" + start.toISOString().slice(0, 10) +
      "&end_date=" + end.toISOString().slice(0, 10) + "&per_page=100");

    var items = [];
    var pages = planner.filter(function (p) { return p.plannable_type === "wiki_page"; });
    var n = 0;

    for (var i = 0; i < planner.length; i++) {
      var p = planner[i];
      var pl = p.plannable || {};
      var entry = {
        ext: p.plannable_type + "-" + pl.id,
        type: p.plannable_type,
        courseId: p.course_id,
        date: p.plannable_date,
        title: (pl.title || pl.name || "").trim(),
        points: pl.points_possible || 0,
        url: "",
        body: ""
      };

      if (p.plannable_type === "wiki_page" && pl.url) {
        n++;
        say("Reading prep page " + n + " of " + pages.length + "…");
        entry.url = location.origin + "/courses/" + p.course_id + "/pages/" + pl.url;
        try {
          var page = await get("/api/v1/courses/" + p.course_id + "/pages/" + pl.url);
          entry.body = textOf(page.body);
        } catch (e) { /* a page we can't read is still worth listing */ }
      } else if (pl.id) {
        entry.url = location.origin + "/courses/" + p.course_id + "/assignments/" + pl.id;
      }

      if (entry.title) items.push(entry);
    }

    /* Grades: the course total Canvas shows the student, plus every assignment
       group and submission so the tracker can break the total down. */
    var grades = [];
    var studentCourses = courses.filter(function (c) {
      return (c.enrollments || []).some(function (e) { return e.type === "student"; });
    });
    for (var g = 0; g < studentCourses.length; g++) {
      var c = studentCourses[g];
      say("Reading grades for course " + (g + 1) + " of " + studentCourses.length + "…");
      var enr = (c.enrollments || []).filter(function (e) { return e.type === "student"; })[0] || {};
      var entryG = {
        courseId: c.id,
        score: enr.computed_current_score == null ? null : enr.computed_current_score,
        grade: enr.computed_current_grade || "",
        finalScore: enr.computed_final_score == null ? null : enr.computed_final_score,
        weighted: !!c.apply_assignment_group_weights,
        hidden: !!c.hide_final_grades,
        groups: [],
        assignments: []
      };
      try {
        var groups = await get("/api/v1/courses/" + c.id +
          "/assignment_groups?include[]=assignments&include[]=submission&per_page=100");
        groups.forEach(function (grp) {
          entryG.groups.push({ id: grp.id, name: grp.name, weight: grp.group_weight || 0 });
          (grp.assignments || []).forEach(function (a) {
            var sub = a.submission || {};
            var status = sub.excused ? "excused"
              : sub.missing ? "missing"
              : sub.score != null ? (sub.late ? "late" : "graded")
              : sub.submitted_at ? "submitted"
              : "unsubmitted";
            entryG.assignments.push({
              id: a.id,
              group: grp.id,
              title: (a.name || "").trim(),
              pts: a.points_possible || 0,
              score: sub.score == null ? null : sub.score,
              grade: sub.grade || "",
              status: status,
              due: a.due_at || "",
              omit: !!a.omit_from_final_grade
            });
          });
        });
      } catch (e) { /* the course total alone is still worth showing */ }
      grades.push(entryG);
    }

    var payload = {
      v: 2,
      origin: location.origin,
      pulledAt: new Date().toISOString(),
      courses: courses.map(function (c) {
        return { id: c.id, name: c.name, code: c.course_code, term: c.term && c.term.name };
      }),
      items: items,
      grades: grades
    };

    var json = JSON.stringify(payload);
    var bytes = new TextEncoder().encode(json);
    var s = "", CH = 0x8000;
    for (var k = 0; k < bytes.length; k += CH) {
      s += String.fromCharCode.apply(null, bytes.subarray(k, k + CH));
    }

    var target = SITE + "#import=" + btoa(s);
    var found = "Found " + items.length + " items and grades for " + grades.length +
      (grades.length === 1 ? " course" : " courses");
    say(found + " — opening your tracker…");

    /* A blocked popup shouldn't lose the pull: offer a link instead, since
       clicking it is the user gesture the browser wanted. */
    if (!window.open(target, "_blank")) {
      box.textContent = found + ". ";
      var a = document.createElement("a");
      a.href = target;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Open your tracker →";
      a.style.cssText = "color:#fff;font-weight:600;text-decoration:underline";
      box.appendChild(a);
      return;
    }
    setTimeout(function () { box.remove(); }, 4000);
  } catch (err) {
    box.style.background = "#A33A1C";
    say("Couldn't read Canvas: " + err.message + ". Make sure you're signed in, then try again.");
    setTimeout(function () { box.remove(); }, 8000);
  }
})();
