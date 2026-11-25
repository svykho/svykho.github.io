/* Small line drawings on the Lab index. They are illustrations of each idea,
   not simulations: the real calculation is one click away. */
(function () {
  "use strict";

  var POS = "255,154,86";
  var NEG = "110,168,247";
  var REST = "140,188,255";
  var TAU = Math.PI * 2;

  var views = Array.prototype.map.call(document.querySelectorAll("canvas[data-preview]"), function (c) {
    return { c: c, ctx: c.getContext("2d"), kind: c.dataset.preview, w: 0, h: 0, seen: true };
  });
  if (!views.length) return;

  function size(v) {
    var w = v.c.clientWidth;
    var h = v.c.clientHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    v.w = w;
    v.h = h;
    v.c.width = Math.round(w * dpr);
    v.c.height = Math.round(h * dpr);
    v.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* Rings of a surface, batched by the sign of the wave on each segment. */
  function rings(v, list, height, project) {
    var ctx = v.ctx;
    var N = 72;
    var levels = [[], [], []];

    list.forEach(function (ring) {
      var prev = null;
      for (var j = 0; j <= N; j += 1) {
        var phi = (TAU * j) / N;
        var h = height(ring, phi);
        var p = project(ring, phi, h);
        if (prev) levels[h > 0.035 ? 0 : h < -0.035 ? 1 : 2].push(prev[0], prev[1], p[0], p[1], ring.fade);
        prev = p;
      }
    });

    [POS, NEG, REST].forEach(function (rgb, k) {
      var seg = levels[k];
      for (var a = 0; a < 4; a += 1) {
        var lo = a / 4;
        var hi = (a + 1) / 4;
        ctx.beginPath();
        for (var s = 0; s < seg.length; s += 5) {
          if (seg[s + 4] > lo && seg[s + 4] <= hi) {
            ctx.moveTo(seg[s], seg[s + 1]);
            ctx.lineTo(seg[s + 2], seg[s + 3]);
          }
        }
        ctx.strokeStyle = "rgba(" + rgb + "," + (k === 2 ? 0.42 : 0.95) * hi + ")";
        ctx.lineWidth = k === 2 ? 0.8 : 1.15;
        ctx.stroke();
      }
    });
  }

  function hole(v, x, y, rx, ry) {
    var ctx = v.ctx;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fillStyle = "#04060a";
    ctx.fill();
    ctx.strokeStyle = "rgba(140,188,255,.75)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function sheetRings() {
    var list = [];
    for (var i = 0; i < 17; i += 1) {
      var r = 1 + i * 0.32;
      list.push({ r: r, fade: Math.max(0.08, 1 - i / 17) });
    }
    return list;
  }
  var SHEET = sheetRings();

  function flat(v) {
    var S = Math.min(v.w / 12.6, v.h / 6.3);
    var cx = v.w / 2;
    var cy = v.h / 2;
    return {
      S: S,
      cx: cx,
      cy: cy,
      project: function (ring, phi, h) {
        return [cx + ring.r * Math.cos(phi) * S, cy + ring.r * Math.sin(phi) * 0.46 * S - h * 0.42 * S];
      },
    };
  }

  var draw = {
    /* a pulse rings the hole: the wave leaves as a damped quadrupole */
    rw: function (v, t) {
      var f = flat(v);
      rings(v, SHEET, function (ring, phi) {
        var env = Math.exp(-0.33 * (ring.r - 1));
        return env * (0.5 + 0.5 * Math.cos(2 * phi)) * Math.sin(3.9 * ring.r - 2.1 * t);
      }, f.project);
      hole(v, f.cx, f.cy, 0.92 * f.S, 0.44 * f.S);
    },

    /* a body spirals in and the wave leaves as a two-armed spiral */
    sn: function (v, t) {
      var f = flat(v);
      var u = ((t % 9) + 9) % 9;
      var R = 1.05 + 3.1 * Math.pow(1 - u / 9, 0.62);
      var orbit = function (r) { return 1.7 * Math.pow(4.2 / r, 1.5); };
      var ph = t * orbit(R) * 0.32;

      rings(v, SHEET, function (ring, phi) {
        var env = ring.r < R ? 0.25 : Math.exp(-0.27 * (ring.r - R));
        return env * Math.cos(2 * phi - 2 * ph + 2.8 * (ring.r - R));
      }, f.project);
      hole(v, f.cx, f.cy, 0.92 * f.S, 0.44 * f.S);

      var ctx = v.ctx;
      ctx.beginPath();
      for (var k = 0; k <= 46; k += 1) {
        var r = R + k * 0.035;
        var a = ph - k * 0.075;
        var x = f.cx + r * Math.cos(a) * f.S;
        var y = f.cy + r * Math.sin(a) * 0.46 * f.S;
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = "rgba(255,178,122,.55)";
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(f.cx + R * Math.cos(ph) * f.S, f.cy + R * Math.sin(ph) * 0.46 * f.S, 2.8, 0, TAU);
      ctx.fillStyle = "#ffb27a";
      ctx.fill();
    },

    /* a packet crosses the throat into the other universe */
    wh: function (v, t) {
      var S = Math.min(v.w / 9.6, v.h / 7.2);
      var cx = v.w / 2;
      var cy = v.h / 2;
      var u = ((t % 8) + 8) % 8;
      var lp = 4.6 - (9.2 * u) / 8;
      var list = [];

      for (var i = -13; i <= 13; i += 1) {
        var l = (i / 13) * 4.4;
        list.push({ l: l, r: Math.sqrt(l * l + 1), z: Math.asinh(l), fade: Math.max(0.1, 1 - Math.abs(i) / 15) });
      }

      rings(v, list, function (ring) {
        var x = (ring.l - lp) / 0.72;
        return Math.exp(-x * x) * Math.cos(5 * x);
      }, function (ring, phi) {
        return [cx + ring.r * Math.cos(phi) * S, cy + ring.r * Math.sin(phi) * 0.3 * S - ring.z * 1.42 * S * 0.5];
      });

      var ctx = v.ctx;
      ctx.beginPath();
      ctx.ellipse(cx, cy, S, 0.3 * S, 0, 0, TAU);
      ctx.strokeStyle = "rgba(237,239,243,.85)";
      ctx.lineWidth = 1.1;
      ctx.stroke();
    },
  };

  function paint(v, t) {
    if (!v.w || !v.h) return;
    v.ctx.clearRect(0, 0, v.w, v.h);
    draw[v.kind](v, t);
  }

  views.forEach(size);
  window.addEventListener("resize", function () {
    views.forEach(function (v) {
      size(v);
      if (window.ASK.still) paint(v, 3.2);
    });
  });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        views.forEach(function (v) {
          if (v.c === e.target) v.seen = e.isIntersecting;
        });
      });
    }, { rootMargin: "60px" });
    views.forEach(function (v) { io.observe(v.c); });
  }

  window.ASK.onFrame(function (t) {
    views.forEach(function (v) {
      if (v.seen || window.ASK.still) paint(v, window.ASK.still ? 3.2 : t);
    });
  });
})();
