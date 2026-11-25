/* Interactive figures for the course on black-hole perturbation theory.
   Each <figure data-widget> in a lesson is built here; the page itself only holds
   the caption. Everything is computed in the browser in units G = c = M = 1,
   except the exact quasinormal frequencies, which come from Leaver's continued
   fraction (computed for this course) and are listed below. */
(function () {
  "use strict";

  var COL = {
    pos: "#ff9a56",
    neg: "#6ea8f7",
    pulse: "#ffb27a",
    ink: "#edeff3",
    ink2: "#aeb5c2",
    ink3: "#848c9b",
    acc: "#8cbcff",
    grid: "rgba(237, 239, 243, 0.07)",
    axis: "rgba(237, 239, 243, 0.26)",
    bg: "#07090e",
  };
  var MONO = '"DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  var TAU = Math.PI * 2;
  var SQ27 = Math.sqrt(27);
  var still = !!(window.ASK && window.ASK.still);
  var uid = 0;

  /* Schwarzschild, M omega. Leaver's continued fraction with the n-th inversion,
     depth 4000, 30 digits; rounded to six decimals. */
  var QNM = {
    2: [[0.373672, -0.088962], [0.346711, -0.273915], [0.301053, -0.478277], [0.251505, -0.705148], [0.207515, -0.946845], [0.169299, -1.195608], [0.133252, -1.447911], [0.092822, -1.703841]],
    3: [[0.599443, -0.092703], [0.582644, -0.281298], [0.551685, -0.479093], [0.511962, -0.690337], [0.470174, -0.915649], [0.431386, -1.152151], [0.39766, -1.395912], [0.368992, -1.643845]],
    4: [[0.809178, -0.094164], [0.796632, -0.284334], [0.77271, -0.479908], [0.739837, -0.683924], [0.701516, -0.898239], [0.661572, -1.122977], [0.623109, -1.356686], [0.587909, -1.597171]],
  };
  /* fundamental modes of the other fields, same method */
  var FUND = {
    rw: { 2: QNM[2][0], 3: QNM[3][0], 4: QNM[4][0] },
    z: { 2: QNM[2][0], 3: QNM[3][0], 4: QNM[4][0] },
    s0: { 2: [0.48364, -0.09676], 3: [0.67537, -0.0965], 4: [0.86742, -0.09639] },
    em: { 2: [0.4576, -0.095], 3: [0.6569, -0.09562], 4: [0.8531, -0.09586] },
  };
  var T_SUN = 4.925491e-6; // G M_sun / c^3 in seconds

  /* ---------- small DOM helpers ---------- */

  function make(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function layout(fig) {
    var stage = make("div", "w-stage");
    var ctrl = make("div", "w-controls");
    fig.insertBefore(ctrl, fig.firstChild);
    fig.insertBefore(stage, ctrl);
    return { stage: stage, ctrl: ctrl };
  }

  function slider(parent, o) {
    var id = "w-in-" + (uid += 1);
    var box = make("div", "rw-field", parent);
    var lab = make("label", null, box);
    lab.htmlFor = id;
    lab.appendChild(document.createTextNode(o.label));
    var out = make("output", null, lab);
    var input = make("input", null, box);
    input.type = "range";
    input.id = id;
    input.min = o.min;
    input.max = o.max;
    input.step = o.step;
    input.value = o.value;
    function show(v) { out.textContent = o.fmt ? o.fmt(v) : String(v); }
    input.addEventListener("input", function () {
      var v = Number(input.value);
      show(v);
      o.on(v);
    });
    show(Number(input.value));
    if (o.note) make("p", "rw-field-note", box, o.note);
    return { set: function (v) { input.value = v; show(Number(input.value)); } };
  }

  function seg(parent, o) {
    var box = make("div", "rw-field", parent);
    make("span", "w-label", box, o.label);
    var group = make("div", "rw-seg" + (o.wide ? " rw-seg-wide" : ""), box);
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", o.label);
    var buttons = o.options.map(function (opt) {
      var b = make("button", null, group, opt[1]);
      b.type = "button";
      b.addEventListener("click", function () {
        pick(opt[0]);
        o.on(opt[0]);
      });
      return { b: b, v: opt[0] };
    });
    function pick(v) {
      buttons.forEach(function (x) { x.b.setAttribute("aria-pressed", String(x.v === v)); });
    }
    pick(o.value);
    return { set: pick };
  }

  function check(parent, o) {
    var lab = make("label", "rw-check", parent);
    var input = make("input", null, lab);
    input.type = "checkbox";
    input.checked = !!o.value;
    if (o.swatch) {
      var sw = make("i", "w-swatch", lab);
      if (o.dot) {
        sw.className = "w-swatch dot";
        sw.style.background = o.dot;
      } else sw.style.borderTop = o.swatch;
    }
    lab.appendChild(document.createTextNode(o.label));
    input.addEventListener("change", function () { o.on(input.checked); });
    return input;
  }

  function readout(parent) {
    var p = make("p", "w-read", parent);
    p.setAttribute("aria-live", "polite");
    return p;
  }

  function button(parent, text, on) {
    var box = parent.querySelector(".rw-buttons") || make("div", "rw-buttons w-buttons", parent);
    var b = make("button", null, box, text);
    b.type = "button";
    b.addEventListener("click", on);
    return b;
  }

  /* ---------- canvas helpers ---------- */

  function panel(parent, cls, label) {
    var c = make("canvas", "w-canvas " + (cls || ""), parent);
    c.setAttribute("role", "img");
    c.setAttribute("aria-label", label);
    var p = { c: c, ctx: c.getContext("2d"), w: 0, h: 0 };
    p.fit = function () {
      var w = c.clientWidth;
      var h = c.clientHeight;
      if (!w || !h) return false;
      var d = Math.min(window.devicePixelRatio || 1, 2);
      var W = Math.round(w * d);
      var H = Math.round(h * d);
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      p.ctx.setTransform(d, 0, 0, d, 0, 0);
      p.ctx.clearRect(0, 0, w, h);
      p.w = w;
      p.h = h;
      return true;
    };
    return p;
  }

  /* pad = [top, right, bottom, left] */
  function frame(p, pad, xr, yr, logy) {
    var F = { x0: pad[3], x1: p.w - pad[1], y0: pad[0], y1: p.h - pad[2], xr: xr, yr: yr, logy: !!logy };
    F.X = function (v) { return F.x0 + ((v - xr[0]) / (xr[1] - xr[0])) * (F.x1 - F.x0); };
    F.Y = function (v) {
      if (F.logy) v = Math.log10(Math.max(Math.abs(v), 1e-300));
      return F.y1 - ((v - yr[0]) / (yr[1] - yr[0])) * (F.y1 - F.y0);
    };
    F.invX = function (px) { return xr[0] + ((px - F.x0) / (F.x1 - F.x0)) * (xr[1] - xr[0]); };
    F.invY = function (py) { return yr[0] + ((F.y1 - py) / (F.y1 - F.y0)) * (yr[1] - yr[0]); };
    F.clampY = function (y) { return Math.max(F.y0 - 2, Math.min(F.y1 + 2, y)); };
    return F;
  }

  /* o: xt, yt (ticks; exponents when log), fx, fy, xl, yl, zeroX, zeroY */
  function axes(ctx, F, o) {
    var yOf = F.logy ? function (e) { return F.Y(Math.pow(10, e)); } : F.Y;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = COL.grid;
    ctx.beginPath();
    (o.xt || []).forEach(function (v) {
      var x = Math.round(F.X(v)) + 0.5;
      ctx.moveTo(x, F.y0);
      ctx.lineTo(x, F.y1);
    });
    (o.yt || []).forEach(function (v) {
      var y = Math.round(yOf(v)) + 0.5;
      ctx.moveTo(F.x0, y);
      ctx.lineTo(F.x1, y);
    });
    ctx.stroke();

    ctx.strokeStyle = COL.axis;
    ctx.beginPath();
    var by = o.zeroY != null ? Math.round(F.Y(o.zeroY)) + 0.5 : Math.round(F.y1) + 0.5;
    ctx.moveTo(F.x0, by);
    ctx.lineTo(F.x1, by);
    if (o.zeroX != null) {
      var zx = Math.round(F.X(o.zeroX)) + 0.5;
      ctx.moveTo(zx, F.y0);
      ctx.lineTo(zx, F.y1);
    }
    ctx.stroke();

    ctx.font = "10.5px " + MONO;
    ctx.fillStyle = COL.ink3;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    (o.xt || []).forEach(function (v) {
      if (o.fx === null) return;
      ctx.fillText(o.fx ? o.fx(v) : String(v), F.X(v), F.y1 + 6);
    });
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    (o.yt || []).forEach(function (v) {
      if (o.fy === null) return;
      ctx.fillText(o.fy ? o.fy(v) : String(v), F.x0 - 7, yOf(v));
    });
    if (o.xl) {
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(o.xl, F.x1, F.y1 + 21);
    }
    if (o.yl) {
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(o.yl, F.x0 + (o.ylIn ? 6 : 0), F.y0 - 6);
    }
    ctx.restore();
  }

  function dot(ctx, x, y, r, fill, ring) {
    ctx.beginPath();
    ctx.arc(x, y, r + (ring ? 2 : 0), 0, TAU);
    if (ring) {
      ctx.fillStyle = COL.bg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
    }
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /* a wave drawn in the two colours of its sign */
  function signed(ctx, n, xAt, yAt, valAt, width) {
    var pos = new Path2D();
    var neg = new Path2D();
    for (var i = 1; i < n; i += 1) {
      var P = valAt(i) + valAt(i - 1) >= 0 ? pos : neg;
      P.moveTo(xAt(i - 1), yAt(i - 1));
      P.lineTo(xAt(i), yAt(i));
    }
    ctx.save();
    ctx.lineWidth = width || 1.6;
    ctx.lineCap = "round";
    ctx.strokeStyle = COL.pos;
    ctx.stroke(pos);
    ctx.strokeStyle = COL.neg;
    ctx.stroke(neg);
    ctx.restore();
  }

  function tooltip(ctx, p, x, y, lines) {
    ctx.save();
    ctx.font = "11px " + MONO;
    var w = 0;
    lines.forEach(function (l) { w = Math.max(w, ctx.measureText(l.t).width + (l.c ? 16 : 0)); });
    var h = lines.length * 16 + 10;
    var bx = x + 14 + w + 16 > p.w ? x - 14 - w - 16 : x + 14;
    var by = Math.max(4, Math.min(p.h - h - 4, y - h / 2));
    ctx.fillStyle = "rgba(7, 9, 14, 0.92)";
    ctx.strokeStyle = "rgba(237, 239, 243, 0.18)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, w + 16, h, 4);
    else ctx.rect(bx, by, w + 16, h);
    ctx.fill();
    ctx.stroke();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    lines.forEach(function (l, i) {
      var ty = by + 13 + i * 16;
      var tx = bx + 8;
      if (l.c) {
        ctx.fillStyle = l.c;
        ctx.fillRect(tx, ty - 1, 10, 2);
        tx += 16;
      }
      ctx.fillStyle = i === 0 && l.head ? COL.ink3 : COL.ink;
      ctx.fillText(l.t, tx, ty);
    });
    ctx.restore();
  }

  function visibility(el) {
    var st = { on: true };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { st.on = es[es.length - 1].isIntersecting; }, { rootMargin: "100px" }).observe(el);
    }
    return st;
  }

  /* ---------- numbers ---------- */

  function cplx(re, im, d) {
    d = d == null ? 4 : d;
    return re.toFixed(d) + (im < 0 ? " − " : " + ") + Math.abs(im).toFixed(d) + "i";
  }
  function f2(v) { return v.toFixed(2); }
  function f3(v) { return v.toFixed(3); }

  // Radius from the tortoise coordinate, M = 1: rs = r + 2 ln(r/2 - 1).
  // With r = 2(1 + w) this is w + ln w = rs/2 - 1; solve for u = ln w, which is
  // well behaved all the way from the horizon to infinity.
  function rOf(rs) {
    var y = rs / 2 - 1;
    var u = y > 1.5 ? Math.log(y - Math.log(y)) : y < -1 ? y : y - 0.6;
    for (var k = 0; k < 60; k += 1) {
      var eu = Math.exp(u);
      var du = (eu + u - y) / (eu + 1);
      u -= du;
      if (Math.abs(du) < 1e-14) break;
    }
    return 2 * (1 + Math.exp(u));
  }
  function rStar(r) { return r + 2 * Math.log(r / 2 - 1); }

  var POT = {
    rw: function (r, l) { var f = 1 - 2 / r; return f * (l * (l + 1) / (r * r) - 6 / (r * r * r)); },
    z: function (r, l) {
      var f = 1 - 2 / r;
      var L = ((l - 1) * (l + 2)) / 2;
      var q = L * r + 3;
      return (f * (2 * L * L * (L + 1) * r * r * r + 6 * L * L * r * r + 18 * L * r + 18)) / (r * r * r * q * q);
    },
    s0: function (r, l) { var f = 1 - 2 / r; return f * (l * (l + 1) / (r * r) + 2 / (r * r * r)); },
    em: function (r, l) { var f = 1 - 2 / r; return (f * l * (l + 1)) / (r * r); },
  };

  /* peak of a potential in r*, with its second derivative there */
  function peak(kind, l) {
    var a = 2.4;
    var b = 4.5;
    var g = (Math.sqrt(5) - 1) / 2;
    for (var k = 0; k < 80; k += 1) {
      var c = b - g * (b - a);
      var d = a + g * (b - a);
      if (POT[kind](c, l) > POT[kind](d, l)) b = d;
      else a = c;
    }
    var r0 = (a + b) / 2;
    var s0 = rStar(r0);
    var h = 1e-3;
    var V = function (s) { return POT[kind](rOf(s), l); };
    var V0 = V(s0);
    return { r: r0, rs: s0, V0: V0, V2: (V(s0 + h) - 2 * V0 + V(s0 - h)) / (h * h) };
  }

  function csqrt(re, im) {
    var m = Math.sqrt(re * re + im * im);
    var a = Math.sqrt((m + re) / 2);
    var b = Math.sqrt((m - re) / 2);
    return [a, im < 0 ? -b : b];
  }

  /* Leapfrog for -psi_tt + psi_xx - V psi = 0 with outgoing ends. The initial
     profile moves towards -x. Returns the signal at the observer, sampled every dt.
     Options: rho, the reflection coefficient of the left end (0 = outgoing,
     -1 = a hard wall); split, a point where the final energy is divided in two. */
  function evolve(o) {
    var dx = o.dx;
    var dt = 0.5 * dx;
    var N = Math.round((o.x1 - o.x0) / dx) + 1;
    var kL = o.rho ? (0.5 * (1 + o.rho)) / (1 - o.rho) : 0.5;
    var V = new Float64Array(N);
    var a = new Float64Array(N);
    var b = new Float64Array(N);
    var c = new Float64Array(N);
    for (var i = 0; i < N; i += 1) {
      var x = o.x0 + i * dx;
      V[i] = o.V(x) * dt * dt;
      a[i] = o.init(x - dt);
      b[i] = o.init(x);
    }
    var lam = (dt / dx) * (dt / dx);
    var k = dt / dx;
    var io = Math.round((o.obs - o.x0) / dx);
    var steps = Math.round(o.T / dt);
    var trace = new Float64Array(steps + 1);
    trace[0] = b[io];
    var snaps = [];
    var sn = o.snap;
    var si0, sm, sstep, severy;
    if (sn) {
      si0 = Math.round((sn.x0 - o.x0) / dx);
      sstep = Math.max(1, Math.round(sn.dx / dx));
      sm = Math.floor(Math.round((sn.x1 - sn.x0) / dx) / sstep) + 1;
      severy = Math.max(1, Math.round(sn.dt / dt));
    }
    function snapshot() {
      var s = new Float32Array(sm);
      for (var j = 0; j < sm; j += 1) s[j] = b[si0 + j * sstep];
      snaps.push(s);
    }
    if (sn) snapshot();
    for (var n = 1; n <= steps; n += 1) {
      for (var m = 1; m < N - 1; m += 1) {
        c[m] = 2 * b[m] - a[m] + lam * (b[m + 1] - 2 * b[m] + b[m - 1]) - V[m] * b[m];
      }
      c[0] = b[0] + kL * (b[1] - b[0]);
      c[N - 1] = b[N - 1] - k * (b[N - 1] - b[N - 2]);
      var t = a;
      a = b;
      b = c;
      c = t;
      trace[n] = b[io];
      if (sn && n % severy === 0) snapshot();
    }
    var ip = 0;
    for (var q = 0; q <= steps; q += 1) if (Math.abs(trace[q]) > Math.abs(trace[ip])) ip = q;
    var out = { y: trace, dt: dt, tp: ip * dt, ip: ip, snaps: snaps, snapDt: sn ? severy * dt : 0, snapDx: sn ? sstep * dx : 0 };
    if (o.split != null) {
      var is = Math.round((o.split - o.x0) / dx);
      out.E = [0, 0];
      for (var j = 0; j < N - 1; j += 1) {
        var pt = (b[j] - a[j]) / dt;
        var px = (b[j + 1] - b[j]) / dx;
        out.E[j < is ? 0 : 1] += 0.5 * (pt * pt + px * px + (V[j] / (dt * dt)) * b[j] * b[j]) * dx;
      }
    }
    return out;
  }

  /* complex numbers as [re, im] */
  function cm(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  function cd(a, b) { var d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; }
  function cabs(a) { return Math.hypot(a[0], a[1]); }

  /* Far from the hole, psi = e^{±i w r*} sum_k a_k / r^k. The series is
     asymptotic, so it is cut where its terms start to grow. Returns u and du/dr. */
  function farSeries(w, r, L, sg, sign) {
    var a0 = [1, 0];
    var am = [0, 0];
    var u = [1, 0];
    var du = [0, 0];
    var x = 1 / r;
    var xk = 1;
    var last = 1;
    var W = typeof w === "number" ? [w, 0] : w;
    for (var j = 0; j < 30; j += 1) {
      // a_{j+1} = ((j(j+1) - L) a_j - (2(j^2-1) + sg) a_{j-1}) / (2 i sign w (j+1))
      var num = [(j * (j + 1) - L) * a0[0] - (2 * (j * j - 1) + sg) * am[0], (j * (j + 1) - L) * a0[1] - (2 * (j * j - 1) + sg) * am[1]];
      var den = [-2 * sign * W[1] * (j + 1), 2 * sign * W[0] * (j + 1)];
      var a1 = cd(num, den);
      xk *= x;
      var term = cabs(a1) * xk;
      if (j > 1 && term > last) break;
      last = term;
      u[0] += a1[0] * xk;
      u[1] += a1[1] * xk;
      du[0] -= (j + 1) * a1[0] * xk * x;
      du[1] -= (j + 1) * a1[1] * xk * x;
      am = a0;
      a0 = a1;
    }
    return { u: u, du: du };
  }

  /* Stationary scattering off the Schwarzschild barrier of a field of spin sp:
     start purely ingoing at the horizon, integrate outwards (RK4 in r*, with r
     carried along), and split the wave far away into its ingoing and outgoing parts. */
  function transmit(w, l, sp) {
    var L = l * (l + 1);
    var sg = 2 * (1 - sp * sp);
    var rs = -40;
    var r = rOf(rs);
    var pr = Math.cos(w * rs), pi = -Math.sin(w * rs);
    var qr = w * pi, qi = -w * pr;
    var w2 = w * w;
    var Rend = Math.max(120, (25 * (l + 1)) / w);
    function acc(rr) { return -(w2 - (1 - 2 / rr) * (L / (rr * rr) + sg / (rr * rr * rr))); }
    while (r < Rend) {
      var h = r < 30 ? 0.05 : Math.min((0.2 * r) / 30, 0.12 / w);
      var k1r = 1 - 2 / r, g1 = acc(r);
      var k1pr = qr, k1pi = qi, k1qr = g1 * pr, k1qi = g1 * pi;
      var r2 = r + 0.5 * h * k1r;
      var g2 = acc(r2);
      var p2r = pr + 0.5 * h * k1pr, p2i = pi + 0.5 * h * k1pi, q2r = qr + 0.5 * h * k1qr, q2i = qi + 0.5 * h * k1qi;
      var k2r = 1 - 2 / r2, k2pr = q2r, k2pi = q2i, k2qr = g2 * p2r, k2qi = g2 * p2i;
      var r3 = r + 0.5 * h * k2r;
      var g3 = acc(r3);
      var p3r = pr + 0.5 * h * k2pr, p3i = pi + 0.5 * h * k2pi, q3r = qr + 0.5 * h * k2qr, q3i = qi + 0.5 * h * k2qi;
      var k3r = 1 - 2 / r3, k3pr = q3r, k3pi = q3i, k3qr = g3 * p3r, k3qi = g3 * p3i;
      var r4 = r + h * k3r;
      var g4 = acc(r4);
      var p4r = pr + h * k3pr, p4i = pi + h * k3pi, q4r = qr + h * k3qr, q4i = qi + h * k3qi;
      var k4r = 1 - 2 / r4, k4pr = q4r, k4pi = q4i, k4qr = g4 * p4r, k4qi = g4 * p4i;
      r += (h / 6) * (k1r + 2 * k2r + 2 * k3r + k4r);
      pr += (h / 6) * (k1pr + 2 * k2pr + 2 * k3pr + k4pr);
      pi += (h / 6) * (k1pi + 2 * k2pi + 2 * k3pi + k4pi);
      qr += (h / 6) * (k1qr + 2 * k2qr + 2 * k3qr + k4qr);
      qi += (h / 6) * (k1qi + 2 * k2qi + 2 * k3qi + k4qi);
      rs += h;
    }
    var f = 1 - 2 / r;
    var so = farSeries(w, r, L, sg, 1);
    var si = farSeries(w, r, L, sg, -1);
    var eo = [Math.cos(w * rs), Math.sin(w * rs)];
    var ei = [eo[0], -eo[1]];
    var po = cm(eo, so.u);
    var qo = cm(eo, [-w * so.u[1] + f * so.du[0], w * so.u[0] + f * so.du[1]]);
    var pin = cm(ei, si.u);
    var qin = cm(ei, [w * si.u[1] + f * si.du[0], -w * si.u[0] + f * si.du[1]]);
    var P = [pr, pi];
    var Q = [qr, qi];
    var det = [cm(pin, qo)[0] - cm(po, qin)[0], cm(pin, qo)[1] - cm(po, qin)[1]];
    var Ain = cd([cm(P, qo)[0] - cm(po, Q)[0], cm(P, qo)[1] - cm(po, Q)[1]], det);
    var Aout = cd([cm(pin, Q)[0] - cm(P, qin)[0], cm(pin, Q)[1] - cm(P, qin)[1]], det);
    var ai = cabs(Ain);
    return { T2: 1 / (ai * ai), R2: (cabs(Aout) * cabs(Aout)) / (ai * ai) };
  }

  /* Two-term linear prediction (Prony) on y[i0..i1] every `step` samples.
     Returns [Re omega, Im omega] of the oscillating pair, or null. */
  function prony(y, i0, i1, step, d) {
    var s11 = 0, s12 = 0, s22 = 0, r1 = 0, r2 = 0;
    for (var i = i0 + 2 * step; i <= i1; i += step) {
      var y0 = y[i], y1 = y[i - step], y2 = y[i - 2 * step];
      s11 += y1 * y1;
      s12 += y1 * y2;
      s22 += y2 * y2;
      r1 += y1 * y0;
      r2 += y2 * y0;
    }
    var det = s11 * s22 - s12 * s12;
    if (!det) return null;
    var c1 = (r1 * s22 - r2 * s12) / det;
    var c2 = (s11 * r2 - s12 * r1) / det;
    var disc = c1 * c1 + 4 * c2;
    if (disc >= 0) return null;
    var re = c1 / 2;
    var im = Math.sqrt(-disc) / 2;
    return [Math.atan2(im, re) / d, Math.log(Math.sqrt(re * re + im * im)) / d];
  }

  /* amplitude and phase of exp(wi t)(A cos wr t + B sin wr t) by least squares */
  function ampfit(y, i0, i1, dt, w) {
    var saa = 0, sab = 0, sbb = 0, ya = 0, yb = 0;
    for (var i = i0; i <= i1; i += 1) {
      var t = (i - i0) * dt;
      var e = Math.exp(w[1] * t);
      var ca = e * Math.cos(w[0] * t);
      var cb = e * Math.sin(w[0] * t);
      saa += ca * ca;
      sab += ca * cb;
      sbb += cb * cb;
      ya += y[i] * ca;
      yb += y[i] * cb;
    }
    var det = saa * sbb - sab * sab;
    if (!det) return [0, 0];
    return [(ya * sbb - yb * sab) / det, (saa * yb - sab * ya) / det];
  }

  var W = {};

  /* ======================================================================
     Lesson 1. A damped oscillator and its two complex frequencies
     ====================================================================== */

  W.oscillator = function (fig) {
    var u = layout(fig);
    var pair = make("div", "w-pair", u.stage);
    var main = panel(pair, "w-h-md", "Displacement of a damped oscillator against time");
    var side = panel(pair, "w-h-md w-narrow", "The two complex frequencies of the oscillator");
    var s = { w0: 0.8, g: 0.12 };
    var seen = visibility(fig);

    slider(u.ctrl, { label: "Natural frequency ω₀", min: 0.3, max: 1.2, step: 0.01, value: s.w0, fmt: f2, on: function (v) { s.w0 = v; draw(); } });
    slider(u.ctrl, { label: "Friction γ", min: 0, max: 1.2, step: 0.01, value: s.g, fmt: f2, on: function (v) { s.g = v; draw(); } });
    var read = readout(u.ctrl);

    function x(t) {
      var d = s.w0 * s.w0 - s.g * s.g;
      var g = s.g;
      if (d > 1e-9) {
        var w = Math.sqrt(d);
        return Math.exp(-g * t) * (Math.cos(w * t) + (g / w) * Math.sin(w * t));
      }
      if (d < -1e-9) {
        var q = Math.sqrt(-d);
        var a = g - q;
        var b = g + q;
        return (b * Math.exp(-a * t) - a * Math.exp(-b * t)) / (b - a);
      }
      return Math.exp(-g * t) * (1 + g * t);
    }

    function roots() {
      var d = s.w0 * s.w0 - s.g * s.g;
      if (d >= 0) {
        var w = Math.sqrt(d);
        return [[w, -s.g], [-w, -s.g]];
      }
      var q = Math.sqrt(-d);
      return [[0, -s.g + q], [0, -s.g - q]];
    }

    var T = 50;
    var playT = 0;

    function drawMain() {
      if (!main.fit()) return;
      var ctx = main.ctx;
      var F = frame(main, [22, 12, 40, 34], [0, T], [-1.08, 1.08]);
      axes(ctx, F, { xt: [0, 10, 20, 30, 40, 50], yt: [-1, 0, 1], zeroY: 0, xl: "time t", yl: "displacement x" });
      var d = s.w0 * s.w0 - s.g * s.g;
      if (d > 0 && s.g > 0) {
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = "rgba(140, 188, 255, 0.55)";
        ctx.lineWidth = 1;
        [1, -1].forEach(function (sg) {
          ctx.beginPath();
          for (var i = 0; i <= 200; i += 1) {
            var t = (T * i) / 200;
            var y = sg * Math.exp(-s.g * t);
            if (i) ctx.lineTo(F.X(t), F.Y(y));
            else ctx.moveTo(F.X(t), F.Y(y));
          }
          ctx.stroke();
        });
        ctx.restore();
      }
      var n = 600;
      var ts = [];
      var ys = [];
      for (var i = 0; i <= n; i += 1) {
        ts.push((T * i) / n);
        ys.push(x(ts[i]));
      }
      signed(ctx, n + 1, function (i) { return F.X(ts[i]); }, function (i) { return F.Y(ys[i]); }, function (i) { return ys[i]; }, 1.6);
      if (!still) {
        var px = F.X(playT);
        var py = F.Y(x(playT));
        ctx.strokeStyle = "rgba(237, 239, 243, 0.14)";
        ctx.beginPath();
        ctx.moveTo(Math.round(px) + 0.5, F.y0);
        ctx.lineTo(Math.round(px) + 0.5, F.y1);
        ctx.stroke();
        dot(ctx, px, py, 3.5, COL.ink, true);
      }
    }

    function drawSide() {
      if (!side.fit()) return;
      var ctx = side.ctx;
      var R = 1.32;
      var asp = (side.h - 62) / (side.w - 40);
      var span = 2 * R;
      var yr0 = -span * asp + 0.22;
      var F = frame(side, [22, 14, 40, 26], [-R, R], [yr0, 0.22]);
      axes(ctx, F, { xt: [-1, 0, 1], yt: [-1, 0], zeroY: 0, zeroX: 0, fx: function (v) { return v.toFixed(0); }, fy: function (v) { return v.toFixed(0); }, xl: "Re ω", yl: "Im ω", ylIn: true });
      ctx.save();
      ctx.font = "10.5px " + MONO;
      ctx.fillStyle = COL.ink3;
      ctx.textAlign = "left";
      ctx.fillText("decaying", F.x0 + 6, F.y1 - 8);
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = "rgba(237, 239, 243, 0.25)";
      ctx.beginPath();
      var cxp = F.X(0);
      var cyp = F.Y(0);
      var rx = F.X(s.w0) - cxp;
      var ry = F.Y(-s.w0) - cyp;
      ctx.ellipse(cxp, cyp, rx, ry, 0, 0, Math.PI);
      ctx.stroke();
      ctx.restore();
      roots().forEach(function (w) { dot(ctx, F.X(w[0]), F.Y(w[1]), 4.5, COL.acc, true); });
    }

    function draw() {
      drawMain();
      drawSide();
      var d = s.w0 * s.w0 - s.g * s.g;
      if (s.g === 0) read.textContent = "ω = ±" + s.w0.toFixed(3) + "\nNo friction: it rings forever.";
      else if (d > 1e-9) {
        var w = Math.sqrt(d);
        read.textContent = "ω = ±" + w.toFixed(3) + " − " + s.g.toFixed(3) + "i\nDamping time τ = 1/γ = " + (1 / s.g).toFixed(2) + "\nQuality factor Q = " + (w / (2 * s.g)).toFixed(2);
      } else if (d < -1e-9) {
        var r = roots();
        read.textContent = "ω = " + r[0][1].toFixed(3) + "i and " + r[1][1].toFixed(3) + "i\nOverdamped: it creeps back without oscillating.";
      } else read.textContent = "ω = −" + s.g.toFixed(3) + "i, twice\nCritical damping.";
    }

    draw();
    window.addEventListener("resize", draw);
    if (document.fonts) document.fonts.ready.then(draw);
    var last = 0;
    if (window.ASK) {
      window.ASK.onFrame(function (clock) {
        var dt = Math.min(clock - last, 0.1);
        last = clock;
        if (still || !seen.on) return;
        playT = (playT + dt * 7) % T;
        drawMain();
      });
    }
  };

  /* ======================================================================
     Lesson 1. A pulse rings a Poschl-Teller bump
     ====================================================================== */

  W.pt = function (fig) {
    var u = layout(fig);
    var field = panel(u.stage, "w-h-sm", "The wave on the line, the bump and the observer");
    var pair = make("div", "w-pair", u.stage);
    var trace = panel(pair, "w-h-md", "The wave recorded by the observer, with a fitted damped sinusoid");
    var plane = panel(pair, "w-h-md w-narrow", "Exact quasinormal frequencies and the fitted one in the complex plane");
    var s = { V0: 0.15, a: 0.18, log: true, u0: 30 };
    var seen = visibility(fig);
    var sim = null;
    var fit = null;
    var play = { t: 0, hold: 0 };
    var OBS = 70;
    var SRC = 30;
    var WIN = 40;
    var VIEW = [-30, 190];

    slider(u.ctrl, { label: "Height V₀", min: 0.05, max: 0.4, step: 0.005, value: s.V0, fmt: f3, on: function (v) { s.V0 = v; queue(); } });
    slider(u.ctrl, { label: "Sharpness α", min: 0.08, max: 0.4, step: 0.005, value: s.a, fmt: f3, on: function (v) { s.a = v; queue(); } });
    var fitSlider = slider(u.ctrl, {
      label: "Fit starts after the peak",
      min: -10,
      max: 130,
      step: 1,
      value: s.u0,
      fmt: function (v) { return "+" + v.toFixed(0); },
      on: function (v) { s.u0 = v; refit(); drawStatic(); },
    });
    seg(u.ctrl, { label: "Vertical scale", options: [[true, "log |ψ|"], [false, "ψ"]], value: true, on: function (v) { s.log = v; drawStatic(); } });
    button(u.ctrl, "Replay", function () { play.t = 0; play.hold = 0; });
    var read = readout(u.ctrl);

    var pending = 0;
    function queue() {
      if (pending) return;
      pending = window.requestAnimationFrame(function () {
        pending = 0;
        run();
      });
    }

    function run() {
      var nu = Math.sqrt(s.V0);
      sim = evolve({
        x0: -150,
        x1: 210,
        dx: 0.2,
        T: 300,
        obs: OBS,
        V: function (x) { var c = Math.cosh(s.a * x); return s.V0 / (c * c); },
        init: function (x) { var z = x - SRC; return Math.exp(-(z * z) / 50) * Math.cos(nu * z); },
        snap: { x0: -60, x1: 110, dx: 0.4, dt: 0.5 },
      });
      play.t = 0;
      play.hold = 0;
      refit();
      drawStatic();
    }

    function refit() {
      var y = sim.y;
      var i0 = sim.ip + Math.round(s.u0 / sim.dt);
      var i1 = Math.min(y.length - 1, i0 + Math.round(WIN / sim.dt));
      var w = prony(y, i0, i1, 5, 5 * sim.dt);
      fit = w ? { w: w, i0: i0, i1: i1, c: ampfit(y, i0, i1, sim.dt, w) } : null;
      var ex = [Math.sqrt(s.V0 - (s.a * s.a) / 4), -s.a / 2];
      var txt = "Exact fundamental mode\n  ω = " + cplx(ex[0], ex[1]);
      if (fit) {
        var err = Math.hypot(fit.w[0] - ex[0], fit.w[1] - ex[1]) / Math.hypot(ex[0], ex[1]);
        txt += "\nFitted to the signal\n  ω = " + cplx(fit.w[0], fit.w[1]) + "\nDifference " + (100 * err).toFixed(err < 0.01 ? 2 : 1) + " %";
      } else txt += "\nNo oscillation found in this window.";
      read.textContent = txt;
    }

    function drawField() {
      if (!sim || !field.fit()) return;
      var ctx = field.ctx;
      var F = frame(field, [14, 12, 26, 12], [-60, 110], [-1.15, 1.15]);
      var base = F.Y(0);
      ctx.save();
      ctx.font = "10.5px " + MONO;
      ctx.fillStyle = "rgba(140, 188, 255, 0.10)";
      ctx.strokeStyle = "rgba(140, 188, 255, 0.55)";
      ctx.beginPath();
      ctx.moveTo(F.x0, base);
      for (var i = 0; i <= 240; i += 1) {
        var x = -60 + (170 * i) / 240;
        var c = Math.cosh(s.a * x);
        ctx.lineTo(F.X(x), F.Y((2.2 * s.V0) / (c * c)));
      }
      ctx.lineTo(F.x1, base);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = COL.axis;
      ctx.beginPath();
      ctx.moveTo(F.x0, Math.round(base) + 0.5);
      ctx.lineTo(F.x1, Math.round(base) + 0.5);
      ctx.stroke();
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = "rgba(237, 239, 243, 0.35)";
      ctx.beginPath();
      ctx.moveTo(Math.round(F.X(OBS)) + 0.5, F.y0);
      ctx.lineTo(Math.round(F.X(OBS)) + 0.5, F.y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COL.ink3;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("observer", F.X(OBS), F.y1 + 6);
      ctx.fillText("bump", F.X(0), F.y1 + 6);
      ctx.textAlign = "left";
      ctx.fillText("x", F.x1 - 8, F.y1 + 6);
      var k = Math.min(sim.snaps.length - 1, Math.floor(play.t / sim.snapDt));
      if (still) k = Math.min(sim.snaps.length - 1, Math.round((sim.tp - 25) / sim.snapDt));
      var snap = sim.snaps[k];
      var dxs = sim.snapDx;
      signed(ctx, snap.length, function (j) { return F.X(-60 + j * dxs); }, function (j) { return F.Y(snap[j]); }, function (j) { return snap[j]; }, 1.5);
      ctx.fillStyle = COL.ink3;
      ctx.textAlign = "left";
      ctx.fillText("t = " + (k * sim.snapDt).toFixed(0), F.x0, F.y0 - 2);
      ctx.restore();
    }

    var traceF = null;

    function drawTrace() {
      if (!sim || !trace.fit()) return;
      var ctx = trace.ctx;
      var y = sim.y;
      var dt = sim.dt;
      var F;
      if (s.log) {
        F = frame(trace, [22, 12, 40, 40], VIEW, [-9, 0.3], true);
        axes(ctx, F, { xt: [0, 50, 100, 150], yt: [-8, -6, -4, -2, 0], fy: function (e) { return e === 0 ? "1" : "1e" + e; }, xl: "time after the peak", yl: "|ψ| at the observer" });
      } else {
        var amp = 0;
        for (var q = 0; q < y.length; q += 1) amp = Math.max(amp, Math.abs(y[q]));
        F = frame(trace, [22, 12, 40, 40], VIEW, [-amp * 1.1, amp * 1.1]);
        axes(ctx, F, { xt: [0, 50, 100, 150], yt: [0], fy: function () { return "0"; }, zeroY: 0, xl: "time after the peak", yl: "ψ at the observer" });
      }
      traceF = F;
      if (fit) {
        ctx.fillStyle = "rgba(140, 188, 255, 0.07)";
        var fx0 = F.X(s.u0);
        var fx1 = F.X(s.u0 + WIN);
        ctx.fillRect(fx0, F.y0, fx1 - fx0, F.y1 - F.y0);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(F.x0, F.y0 - 2, F.x1 - F.x0, F.y1 - F.y0 + 4);
      ctx.clip();
      ctx.strokeStyle = COL.ink;
      ctx.lineWidth = 1.3;
      ctx.lineJoin = "round";
      ctx.beginPath();
      var started = false;
      for (var i = 0; i < y.length; i += 2) {
        var uu = i * dt - sim.tp;
        if (uu < VIEW[0] || uu > VIEW[1]) continue;
        var py = F.clampY(F.Y(y[i]));
        if (started) ctx.lineTo(F.X(uu), py);
        else {
          ctx.moveTo(F.X(uu), py);
          started = true;
        }
      }
      ctx.stroke();
      if (fit) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = COL.acc;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        var t0 = fit.i0 * dt - sim.tp;
        var amp0 = Math.hypot(fit.c[0], fit.c[1]);
        started = false;
        for (var tt = 0; t0 + tt <= VIEW[1]; tt += 0.25) {
          var v = s.log ? amp0 * Math.exp(fit.w[1] * tt) : Math.exp(fit.w[1] * tt) * (fit.c[0] * Math.cos(fit.w[0] * tt) + fit.c[1] * Math.sin(fit.w[0] * tt));
          var yy = F.clampY(F.Y(v));
          if (started) ctx.lineTo(F.X(t0 + tt), yy);
          else {
            ctx.moveTo(F.X(t0 + tt), yy);
            started = true;
          }
        }
        ctx.stroke();
      }
      ctx.restore();
      if (!still && play.t > 0) {
        var ux = F.X(play.t - sim.tp);
        if (ux >= F.x0 && ux <= F.x1) {
          ctx.strokeStyle = "rgba(237, 239, 243, 0.3)";
          ctx.beginPath();
          ctx.moveTo(Math.round(ux) + 0.5, F.y0);
          ctx.lineTo(Math.round(ux) + 0.5, F.y1);
          ctx.stroke();
        }
      }
    }

    function drawPlane() {
      if (!plane.fit()) return;
      var ctx = plane.ctx;
      var F = frame(plane, [22, 14, 40, 34], [0, 0.72], [-1.1, 0.05]);
      axes(ctx, F, { xt: [0, 0.3, 0.6], yt: [-1, -0.5, 0], fx: function (v) { return v.toFixed(1); }, fy: function (v) { return v.toFixed(1); }, zeroY: 0, xl: "Re ω", yl: "Im ω" });
      var wr = Math.sqrt(s.V0 - (s.a * s.a) / 4);
      ctx.save();
      ctx.font = "10.5px " + MONO;
      ctx.textBaseline = "middle";
      for (var n = 0; n < 3; n += 1) {
        var px = F.X(wr);
        var py = F.Y(-s.a * (n + 0.5));
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, TAU);
        ctx.strokeStyle = COL.ink;
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.fillStyle = COL.ink3;
        ctx.textAlign = px > F.x1 - 40 ? "right" : "left";
        ctx.fillText("n=" + n, px + (px > F.x1 - 40 ? -10 : 10), py);
      }
      if (fit && fit.w[0] > 0 && fit.w[0] < 0.72 && fit.w[1] > -1.1) {
        var fx = F.X(fit.w[0]);
        var fy = F.Y(fit.w[1]);
        ctx.strokeStyle = COL.acc;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(fx - 4.5, fy - 4.5);
        ctx.lineTo(fx + 4.5, fy + 4.5);
        ctx.moveTo(fx + 4.5, fy - 4.5);
        ctx.lineTo(fx - 4.5, fy + 4.5);
        ctx.stroke();
      }
      ctx.fillStyle = COL.ink3;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("○ exact   × fit", F.x0 + 8, F.y1 - 8);
      ctx.restore();
    }

    function drawStatic() {
      drawField();
      drawTrace();
      drawPlane();
    }

    /* drag the fit window on the trace */
    var dragging = false;
    function fromPointer(e) {
      if (!traceF) return;
      var r = trace.c.getBoundingClientRect();
      var v = Math.round(traceF.invX(e.clientX - r.left));
      v = Math.max(-10, Math.min(130, v));
      if (v !== s.u0) {
        s.u0 = v;
        fitSlider.set(v);
        refit();
        drawStatic();
      }
    }
    trace.c.addEventListener("pointerdown", function (e) {
      dragging = true;
      trace.c.setPointerCapture(e.pointerId);
      fromPointer(e);
    });
    trace.c.addEventListener("pointermove", function (e) { if (dragging) fromPointer(e); });
    trace.c.addEventListener("pointerup", function () { dragging = false; });
    trace.c.style.cursor = "ew-resize";

    run();
    window.addEventListener("resize", drawStatic);
    if (document.fonts) document.fonts.ready.then(drawStatic);
    var last = 0;
    if (window.ASK) {
      window.ASK.onFrame(function (clock) {
        var dt = Math.min(clock - last, 0.1);
        last = clock;
        if (still || !seen.on || !sim) return;
        var T = (sim.snaps.length - 1) * sim.snapDt;
        if (play.t >= T) {
          play.hold += dt;
          if (play.hold > 2) {
            play.t = 0;
            play.hold = 0;
          }
        } else play.t = Math.min(T, play.t + dt * 26);
        drawField();
        drawTrace();
      });
    }
  };

  /* ======================================================================
     Lesson 4. Two ways to deform a sphere
     ====================================================================== */

  function legendre(l, x) {
    var p0 = 1;
    var p1 = x;
    if (l === 0) return 1;
    for (var k = 2; k <= l; k += 1) {
      var p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k;
      p0 = p1;
      p1 = p2;
    }
    return p1;
  }
  function dlegendre(l, x) {
    if (Math.abs(x) > 0.999999) x = x > 0 ? 0.999999 : -0.999999;
    return (l * (x * legendre(l, x) - legendre(l - 1, x))) / (x * x - 1);
  }

  W.deform = function (fig) {
    var u = layout(fig);
    var view = panel(u.stage, "w-h-lg", "A sphere deformed by a polar or an axial perturbation");
    var s = { l: 2, kind: "polar" };
    var seen = visibility(fig);
    seg(u.ctrl, { label: "Multipole ℓ", options: [[2, "2"], [3, "3"], [4, "4"]], value: 2, on: function (v) { s.l = v; text(); } });
    seg(u.ctrl, { label: "Parity", options: [["polar", "Polar"], ["axial", "Axial"]], value: "polar", on: function (v) { s.kind = v; text(); } });
    var read = readout(u.ctrl);

    var NOTES = {
      polar2: "Polar, ℓ = 2. The sphere stretches along the axis while the equator pulls in, then the other way round. This is the quadrupole that dominates the waves from merging black holes.",
      polar3: "Polar, ℓ = 3. One pole bulges while the other flattens: the shape is not symmetric under reflection through the centre.",
      polar4: "Polar, ℓ = 4. Three bands alternate between bulging and pulling in.",
      axial2: "Axial, ℓ = 2. The shape does not change at all. The northern and southern hemispheres twist in opposite directions.",
      axial3: "Axial, ℓ = 3. The polar caps turn one way and a belt around the equator turns the other.",
      axial4: "Axial, ℓ = 4. Four bands of latitude twist, alternating in direction.",
    };
    function text() { read.textContent = NOTES[s.kind + s.l]; }
    text();

    var TILT = 0.36;
    var ct = Math.cos(TILT);
    var st = Math.sin(TILT);

    function draw(clock) {
      if (!view.fit()) return;
      var ctx = view.ctx;
      var S = Math.min(view.w, view.h) * 0.36;
      var cx = view.w / 2;
      var cy = view.h / 2 + 4;
      var osc = Math.cos(1.5 * clock);
      var l = s.l;
      var norm = (l * (l + 1)) / 2;
      var groups = {};
      function add(key, a, b) {
        (groups[key] = groups[key] || []).push(a[0], a[1], b[0], b[1]);
      }
      function point(th, ph) {
        var c = Math.cos(th);
        var R = 1;
        var phi = ph;
        if (s.kind === "polar") R = 1 + 0.17 * legendre(l, c) * osc;
        else phi = ph - 0.5 * (dlegendre(l, c) / norm) * osc;
        var x = R * Math.sin(th) * Math.cos(phi);
        var y = R * Math.sin(th) * Math.sin(phi);
        var z = R * c;
        var yy = y * ct - z * st;
        var zz = y * st + z * ct;
        return [cx + S * x, cy - S * zz, yy];
      }
      function amount(th) {
        var c = Math.cos(th);
        return s.kind === "polar" ? legendre(l, c) * osc : -(dlegendre(l, c) / norm) * osc * Math.sin(th);
      }
      function segm(th1, ph1, th2, ph2) {
        var a = point(th1, ph1);
        var b = point(th2, ph2);
        var m = amount((th1 + th2) / 2);
        var col = m > 0.06 ? "p" : m < -0.06 ? "n" : "r";
        var back = (a[2] + b[2]) / 2 < 0 ? "b" : "f";
        add(col + back, a, b);
      }
      var NT = 12;
      var NP = 16;
      var k, j;
      for (k = 1; k < NT; k += 1) {
        var th = (Math.PI * k) / NT;
        for (j = 0; j < 72; j += 1) segm(th, (TAU * j) / 72, th, (TAU * (j + 1)) / 72);
      }
      for (j = 0; j < NP; j += 1) {
        var ph = (TAU * j) / NP;
        for (k = 0; k < 48; k += 1) segm((Math.PI * k) / 48, ph, (Math.PI * (k + 1)) / 48, ph);
      }
      var STYLE = { p: COL.pos, n: COL.neg, r: "rgba(237, 239, 243, 0.42)" };
      ["b", "f"].forEach(function (side) {
        ["r", "p", "n"].forEach(function (col) {
          var g = groups[col + side];
          if (!g) return;
          ctx.beginPath();
          for (var i = 0; i < g.length; i += 4) {
            ctx.moveTo(g[i], g[i + 1]);
            ctx.lineTo(g[i + 2], g[i + 3]);
          }
          ctx.strokeStyle = STYLE[col];
          ctx.globalAlpha = side === "b" ? 0.2 : col === "r" ? 0.7 : 0.95;
          ctx.lineWidth = side === "b" ? 0.8 : 1.15;
          ctx.stroke();
        });
      });
      ctx.globalAlpha = 1;
      var np = point(0, 0);
      ctx.font = "10.5px " + MONO;
      ctx.fillStyle = COL.ink3;
      ctx.textAlign = "center";
      ctx.fillText("axis", np[0], np[1] - 12);
    }

    var lastClock = 0;
    draw(0);
    window.addEventListener("resize", function () { draw(lastClock); });
    if (window.ASK) {
      window.ASK.onFrame(function (clock) {
        if (still) {
          draw(0.35);
          return;
        }
        if (!seen.on) return;
        lastClock = clock;
        draw(clock);
      });
    }
  };

  /* ======================================================================
     Lesson 4. The potentials
     ====================================================================== */

  var SERIES = [
    { k: "rw", name: "Regge–Wheeler (axial)", short: "RW", color: COL.ink, dash: [], on: true },
    { k: "z", name: "Zerilli (polar)", short: "Zerilli", color: COL.acc, dash: [6, 4], on: true },
    { k: "s0", name: "Scalar", short: "scalar", color: COL.pulse, dash: [1.5, 3.5], on: false },
    { k: "em", name: "Electromagnetic", short: "EM", color: COL.ink3, dash: [10, 4, 2, 4], on: false },
  ];

  W.potential = function (fig) {
    var u = layout(fig);
    var view = panel(u.stage, "w-h-lg", "Effective potentials of a Schwarzschild black hole");
    var s = { l: 2, axis: "rs", hover: null };
    var on = {};
    SERIES.forEach(function (c) { on[c.k] = c.on; });
    slider(u.ctrl, { label: "Multipole ℓ", min: 2, max: 6, step: 1, value: 2, fmt: function (v) { return v.toFixed(0); }, on: function (v) { s.l = v; draw(); } });
    var box = make("div", "rw-field", u.ctrl);
    make("span", "w-label", box, "Fields");
    SERIES.forEach(function (c) {
      check(box, {
        label: c.name,
        value: c.on,
        swatch: "1.5px " + (c.dash.length ? (c.dash[0] < 2 ? "dotted " : "dashed ") : "solid ") + c.color,
        on: function (v) { on[c.k] = v; draw(); },
      });
    });
    seg(u.ctrl, { label: "Horizontal axis", options: [["rs", "tortoise r*"], ["r", "radius r"]], value: "rs", on: function (v) { s.axis = v; draw(); } });
    var read = readout(u.ctrl);
    var F = null;

    function xr() { return s.axis === "r" ? [2, 14] : [-12, 28]; }
    function rAt(x) { return s.axis === "r" ? x : rOf(x); }

    function draw() {
      if (!view.fit()) return;
      var ctx = view.ctx;
      var l = s.l;
      var vmax = 0;
      var peaks = {};
      SERIES.forEach(function (c) {
        if (!on[c.k]) return;
        peaks[c.k] = peak(c.k, l);
        vmax = Math.max(vmax, peaks[c.k].V0);
      });
      if (!vmax) vmax = peak("rw", l).V0;
      var top = vmax * 1.18;
      var range = xr();
      F = frame(view, [24, 14, 42, 48], range, [0, top]);
      var step = top > 1 ? 0.5 : top > 0.4 ? 0.2 : 0.05;
      var yt = [];
      for (var v = 0; v <= top + 1e-9; v += step) yt.push(Number(v.toFixed(2)));
      var xt = s.axis === "r" ? [2, 4, 6, 8, 10, 12, 14] : [-10, 0, 10, 20];
      axes(ctx, F, { xt: xt, yt: yt, fy: function (v) { return v.toFixed(2); }, xl: s.axis === "r" ? "r / M" : "r* / M  · to infinity →", yl: "V  (1/M²)" });

      ctx.save();
      var lx = F.X(s.axis === "r" ? 3 : rStar(3));
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = "rgba(237, 239, 243, 0.3)";
      ctx.beginPath();
      ctx.moveTo(Math.round(lx) + 0.5, F.y0);
      ctx.lineTo(Math.round(lx) + 0.5, F.y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "10.5px " + MONO;
      ctx.fillStyle = COL.ink3;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("light ring, r = 3M", lx + 6, F.y0 + 2);
      ctx.fillText(s.axis === "rs" ? "← to the horizon" : "horizon", F.x0, F.y1 + 21);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(F.x0, F.y0 - 4, F.x1 - F.x0, F.y1 - F.y0 + 4);
      ctx.clip();
      SERIES.forEach(function (c) {
        if (!on[c.k]) return;
        ctx.beginPath();
        for (var i = 0; i <= 500; i += 1) {
          var x = range[0] + ((range[1] - range[0]) * i) / 500;
          var r = rAt(x);
          var y = r <= 2 ? 0 : POT[c.k](r, l);
          if (i) ctx.lineTo(F.X(x), F.Y(y));
          else ctx.moveTo(F.X(x), F.Y(y));
        }
        ctx.setLineDash(c.dash);
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 1.7;
        ctx.stroke();
      });
      ctx.restore();

      if (s.hover != null && s.hover >= F.x0 && s.hover <= F.x1) {
        var hx = F.invX(s.hover);
        var hr = rAt(hx);
        ctx.strokeStyle = "rgba(237, 239, 243, 0.35)";
        ctx.beginPath();
        ctx.moveTo(Math.round(s.hover) + 0.5, F.y0);
        ctx.lineTo(Math.round(s.hover) + 0.5, F.y1);
        ctx.stroke();
        var lines = [{ t: "r = " + hr.toFixed(2) + "M   r* = " + rStar(hr).toFixed(2) + "M", head: true }];
        SERIES.forEach(function (c) {
          if (!on[c.k]) return;
          var vv = POT[c.k](hr, l);
          dot(ctx, s.hover, F.Y(vv), 3, c.color, true);
          lines.push({ t: c.short + "  " + vv.toFixed(4), c: c.color });
        });
        tooltip(ctx, view, s.hover, (F.y0 + F.y1) / 2, lines);
      }

      var txt = "Peak of each barrier";
      SERIES.forEach(function (c) {
        if (!peaks[c.k]) return;
        txt += "\n  " + (c.short + "        ").slice(0, 8) + "r = " + peaks[c.k].r.toFixed(2) + "M  V = " + peaks[c.k].V0.toFixed(4);
      });
      txt += "\nLight-ring estimate\n  r = 3M  V = ℓ(ℓ+1)/27 = " + ((l * (l + 1)) / 27).toFixed(4);
      read.textContent = txt;
    }

    view.c.addEventListener("pointermove", function (e) {
      var r = view.c.getBoundingClientRect();
      s.hover = e.clientX - r.left;
      draw();
    });
    view.c.addEventListener("pointerleave", function () {
      s.hover = null;
      draw();
    });
    draw();
    window.addEventListener("resize", draw);
    if (document.fonts) document.fonts.ready.then(draw);
  };

  /* ======================================================================
     Lesson 6. The spectrum
     ====================================================================== */

  var LCOL = { 2: COL.ink, 3: COL.acc, 4: COL.pulse };

  function approx(l) {
    var p = peak("rw", l);
    var a = Math.sqrt(-p.V2 / (2 * p.V0));
    var out = { eik: [], wkb: [], pt: [] };
    for (var n = 0; n < 8; n += 1) {
      out.eik.push([(l + 0.5) / SQ27, -(n + 0.5) / SQ27]);
      out.pt.push([Math.sqrt(p.V0 - (a * a) / 4), -a * (n + 0.5)]);
      out.wkb.push(csqrt(p.V0, -(n + 0.5) * Math.sqrt(-2 * p.V2)));
    }
    return out;
  }

  W.spectrum = function (fig) {
    var u = layout(fig);
    var view = panel(u.stage, "w-h-xl", "Quasinormal frequencies of a Schwarzschild black hole in the complex plane");
    var s = { l: { 2: true, 3: true, 4: true }, eik: false, wkb: false, pt: false, hover: null, pin: null };
    var AP = { 2: approx(2), 3: approx(3), 4: approx(4) };

    var lbox = make("div", "rw-field", u.ctrl);
    make("span", "w-label", lbox, "Multipoles");
    [2, 3, 4].forEach(function (l) {
      check(lbox, { label: "ℓ = " + l, value: true, swatch: true, dot: LCOL[l], on: function (v) { s.l[l] = v; draw(); } });
    });
    var abox = make("div", "rw-field", u.ctrl);
    make("span", "w-label", abox, "Approximations");
    check(abox, { label: "Light ring (eikonal) +", value: false, on: function (v) { s.eik = v; draw(); } });
    check(abox, { label: "WKB, first order ×", value: false, on: function (v) { s.wkb = v; draw(); } });
    check(abox, { label: "Pöschl–Teller ◇", value: false, on: function (v) { s.pt = v; draw(); } });
    var read = readout(u.ctrl);
    read.textContent = "Point at a mode to read its frequency.";
    var pts = [];
    var F = null;

    function marker(ctx, kind, x, y, col) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (kind === "eik") {
        ctx.moveTo(x - 5, y);
        ctx.lineTo(x + 5, y);
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x, y + 5);
      } else if (kind === "wkb") {
        ctx.moveTo(x - 4, y - 4);
        ctx.lineTo(x + 4, y + 4);
        ctx.moveTo(x + 4, y - 4);
        ctx.lineTo(x - 4, y + 4);
      } else {
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x + 5, y);
        ctx.lineTo(x, y + 5);
        ctx.lineTo(x - 5, y);
        ctx.closePath();
      }
      ctx.stroke();
    }

    function draw() {
      if (!view.fit()) return;
      var ctx = view.ctx;
      F = frame(view, [26, 18, 42, 46], [0, 1.0], [-1.8, 0.04]);
      axes(ctx, F, {
        xt: [0, 0.2, 0.4, 0.6, 0.8, 1.0],
        yt: [-1.5, -1, -0.5, 0],
        fx: function (v) { return v.toFixed(1); },
        fy: function (v) { return v.toFixed(1); },
        zeroY: 0,
        xl: "Re Mω  (pitch)",
        yl: "Im Mω  (decay)",
      });
      pts = [];
      ctx.save();
      ctx.beginPath();
      ctx.rect(F.x0, F.y0 - 6, F.x1 - F.x0, F.y1 - F.y0 + 6);
      ctx.clip();
      [2, 3, 4].forEach(function (l) {
        if (!s.l[l]) return;
        ["eik", "wkb", "pt"].forEach(function (k) {
          if (!s[k]) return;
          AP[l][k].forEach(function (w, n) {
            var x = F.X(w[0]);
            var y = F.Y(w[1]);
            ctx.globalAlpha = 0.75;
            marker(ctx, k, x, y, LCOL[l]);
            ctx.globalAlpha = 1;
            pts.push({ x: x, y: y, l: l, n: n, w: w, k: k });
          });
        });
      });
      [2, 3, 4].forEach(function (l) {
        if (!s.l[l]) return;
        QNM[l].forEach(function (w, n) {
          var x = F.X(w[0]);
          var y = F.Y(w[1]);
          var hot = s.hover && s.hover.l === l && s.hover.n === n && !s.hover.k;
          dot(ctx, x, y, hot ? 5.5 : 4.2, LCOL[l], true);
          pts.push({ x: x, y: y, l: l, n: n, w: w });
        });
        var w0 = QNM[l][0];
        ctx.font = "11px " + MONO;
        ctx.fillStyle = COL.ink2;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("ℓ = " + l, F.X(w0[0]) + 10, F.Y(w0[1]));
      });
      ctx.restore();
      ctx.font = "10.5px " + MONO;
      ctx.fillStyle = COL.ink3;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      var w2 = QNM[2];
      if (s.l[2]) ctx.fillText("n = 7", F.X(w2[7][0]) + 9, F.Y(w2[7][1]) + 4);
      if (s.l[2]) {
        ctx.textAlign = "right";
        ctx.fillText("n = 0", F.X(w2[0][0]) - 10, F.Y(w2[0][1]) + 4);
      }
      if (s.hover) {
        var h = s.hover;
        var names = { eik: "Light-ring estimate", wkb: "First-order WKB", pt: "Pöschl–Teller fit" };
        var lines = [{ t: (h.k ? names[h.k] : "Exact (Leaver)") + ", ℓ = " + h.l + ", n = " + h.n, head: true }, { t: "Mω = " + cplx(h.w[0], h.w[1], h.k ? 4 : 5), c: LCOL[h.l] }];
        if (h.k) {
          var ex = QNM[h.l][h.n];
          lines.push({ t: "error " + ((100 * Math.hypot(h.w[0] - ex[0], h.w[1] - ex[1])) / Math.hypot(ex[0], ex[1])).toFixed(1) + " %" });
        }
        tooltip(ctx, view, h.x, h.y, lines);
      }
    }

    function nearest(e) {
      var r = view.c.getBoundingClientRect();
      var x = e.clientX - r.left;
      var y = e.clientY - r.top;
      var best = null;
      var bd = 14 * 14;
      pts.forEach(function (p) {
        var d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
        if (d < bd) {
          bd = d;
          best = p;
        }
      });
      return best;
    }
    view.c.addEventListener("pointermove", function (e) {
      var p = nearest(e);
      if (p !== s.hover) {
        s.hover = p;
        if (p) read.textContent = (p.k ? "Approximation" : "Exact") + ", ℓ = " + p.l + ", n = " + p.n + "\nMω = " + cplx(p.w[0], p.w[1], 5) + "\nDamping time τ = " + (-1 / p.w[1]).toFixed(2) + "M";
        draw();
      }
    });
    view.c.addEventListener("pointerdown", function (e) {
      var p = nearest(e);
      s.hover = p;
      if (p) read.textContent = (p.k ? "Approximation" : "Exact") + ", ℓ = " + p.l + ", n = " + p.n + "\nMω = " + cplx(p.w[0], p.w[1], 5) + "\nDamping time τ = " + (-1 / p.w[1]).toFixed(2) + "M";
      draw();
    });
    view.c.addEventListener("pointerleave", function (e) {
      if (e.pointerType === "touch") return;
      s.hover = null;
      draw();
    });

    var tbl = make("details", "w-table", fig);
    make("summary", null, tbl, "Table of values");
    var table = make("table", null, make("div", null, tbl));
    var thead = make("tr", null, make("thead", null, table));
    ["n", "ℓ = 2", "ℓ = 3", "ℓ = 4"].forEach(function (h) { make("th", null, thead, h).scope = "col"; });
    var tb = make("tbody", null, table);
    for (var n = 0; n < 8; n += 1) {
      var tr = make("tr", null, tb);
      make("th", null, tr, String(n)).scope = "row";
      [2, 3, 4].forEach(function (l) { make("td", null, tr, cplx(QNM[l][n][0], QNM[l][n][1], 5)); });
    }
    make("p", "w-table-note", tbl, "Mω for gravitational perturbations of a Schwarzschild black hole, computed for this course with Leaver's continued fraction. The modes with negative real part are the mirror images −ω*.");
    fig.appendChild(fig.querySelector("figcaption"));

    draw();
    window.addEventListener("resize", draw);
    if (document.fonts) document.fonts.ready.then(draw);
  };

  /* ======================================================================
     Lesson 6. Measure it yourself
     ====================================================================== */

  W.ringdown = function (fig) {
    var u = layout(fig);
    var main = panel(u.stage, "w-h-lg", "The signal of a black hole hit by a wave packet, on a logarithmic scale, with a fitted damped sinusoid");
    var errp = panel(u.stage, "w-h-sm", "Error of the fitted frequency against the time at which the fit starts");
    var s = { l: 2, kind: "rw", u0: 40, log: true };
    var WIN = 40;
    var VIEW = [-20, 260];
    var cache = {};
    var sim = null;
    var fit = null;
    var errs = null;

    seg(u.ctrl, { label: "Multipole ℓ", options: [[2, "2"], [3, "3"], [4, "4"]], value: 2, on: function (v) { s.l = v; load(); } });
    seg(u.ctrl, {
      label: "Field",
      wide: true,
      options: [["rw", "Axial (RW)"], ["z", "Polar (Zerilli)"], ["s0", "Scalar"], ["em", "Electromagnetic"]],
      value: "rw",
      on: function (v) { s.kind = v; load(); },
    });
    var fitSlider = slider(u.ctrl, { label: "Fit starts after the peak", min: -10, max: 210, step: 1, value: s.u0, fmt: function (v) { return "+" + v.toFixed(0) + "M"; }, on: function (v) { s.u0 = v; refit(); draw(); } });
    seg(u.ctrl, { label: "Vertical scale", options: [[true, "log |ψ|"], [false, "ψ"]], value: true, on: function (v) { s.log = v; draw(); } });
    var read = readout(u.ctrl);

    function load() {
      var key = s.kind + s.l;
      if (!cache[key]) {
        var l = s.l;
        var kind = s.kind;
        cache[key] = evolve({
          x0: -300,
          x1: 600,
          dx: 0.2,
          T: 430,
          obs: 100,
          V: function (x) { return POT[kind](rOf(x), l); },
          init: function (x) { var z = x - 50; return Math.exp(-(z * z) / 72) * Math.cos(0.4 * z); },
        });
        cache[key].errs = scan(cache[key], FUND[kind][l]);
      }
      sim = cache[key];
      errs = sim.errs;
      refit();
      draw();
    }

    function fitAt(S, u0) {
      var i0 = S.ip + Math.round(u0 / S.dt);
      var i1 = Math.min(S.y.length - 1, i0 + Math.round(WIN / S.dt));
      if (i1 - i0 < 40) return null;
      var w = prony(S.y, i0, i1, 5, 5 * S.dt);
      return w ? { w: w, i0: i0, i1: i1 } : null;
    }

    function scan(S, ex) {
      var out = [];
      for (var v = -10; v <= 210; v += 1) {
        var f = fitAt(S, v);
        out.push(f ? Math.hypot(f.w[0] - ex[0], f.w[1] - ex[1]) / Math.hypot(ex[0], ex[1]) : NaN);
      }
      return out;
    }

    function refit() {
      fit = fitAt(sim, s.u0);
      if (fit) fit.c = ampfit(sim.y, fit.i0, fit.i1, sim.dt, fit.w);
      var ex = FUND[s.kind][s.l];
      var txt = "Leaver, n = 0\n  Mω = " + cplx(ex[0], ex[1], 5);
      if (fit) {
        var err = Math.hypot(fit.w[0] - ex[0], fit.w[1] - ex[1]) / Math.hypot(ex[0], ex[1]);
        txt += "\nFitted to the signal\n  Mω = " + cplx(fit.w[0], fit.w[1], 5) + "\nDifference " + (err < 0.001 ? (100 * err).toFixed(3) : (100 * err).toFixed(err < 0.1 ? 2 : 1)) + " %";
      } else txt += "\nNo oscillation in this window.";
      read.textContent = txt;
    }

    var mainF = null;

    function drawMain() {
      if (!sim || !main.fit()) return;
      var ctx = main.ctx;
      var y = sim.y;
      var dt = sim.dt;
      var F;
      if (s.log) {
        F = frame(main, [24, 14, 40, 44], VIEW, [-12, 0.3], true);
        axes(ctx, F, { xt: [0, 50, 100, 150, 200, 250], yt: [-12, -10, -8, -6, -4, -2, 0], fy: function (e) { return e === 0 ? "1" : "1e" + e; }, xl: "time after the peak  (M)", yl: "|ψ| far from the hole" });
      } else {
        var amp = 0;
        for (var q = 0; q < y.length; q += 1) amp = Math.max(amp, Math.abs(y[q]));
        F = frame(main, [24, 14, 40, 44], VIEW, [-amp * 1.1, amp * 1.1]);
        axes(ctx, F, { xt: [0, 50, 100, 150, 200, 250], yt: [0], fy: function () { return "0"; }, zeroY: 0, xl: "time after the peak  (M)", yl: "ψ far from the hole" });
      }
      mainF = F;
      if (fit) {
        ctx.fillStyle = "rgba(140, 188, 255, 0.07)";
        ctx.fillRect(F.X(s.u0), F.y0, F.X(s.u0 + WIN) - F.X(s.u0), F.y1 - F.y0);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(F.x0, F.y0 - 2, F.x1 - F.x0, F.y1 - F.y0 + 4);
      ctx.clip();
      ctx.strokeStyle = COL.ink;
      ctx.lineWidth = 1.3;
      ctx.lineJoin = "round";
      ctx.beginPath();
      var started = false;
      for (var i = 0; i < y.length; i += 2) {
        var uu = i * dt - sim.tp;
        if (uu < VIEW[0] || uu > VIEW[1]) continue;
        var py = F.clampY(F.Y(y[i]));
        if (started) ctx.lineTo(F.X(uu), py);
        else {
          ctx.moveTo(F.X(uu), py);
          started = true;
        }
      }
      ctx.stroke();
      if (fit) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = COL.acc;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        var t0 = fit.i0 * dt - sim.tp;
        var amp0 = Math.hypot(fit.c[0], fit.c[1]);
        started = false;
        for (var tt = 0; t0 + tt <= VIEW[1]; tt += 0.25) {
          var v = s.log ? amp0 * Math.exp(fit.w[1] * tt) : Math.exp(fit.w[1] * tt) * (fit.c[0] * Math.cos(fit.w[0] * tt) + fit.c[1] * Math.sin(fit.w[0] * tt));
          var yy = F.clampY(F.Y(v));
          if (started) ctx.lineTo(F.X(t0 + tt), yy);
          else {
            ctx.moveTo(F.X(t0 + tt), yy);
            started = true;
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawErr() {
      if (!errs || !errp.fit()) return;
      var ctx = errp.ctx;
      var F = frame(errp, [22, 14, 40, 44], VIEW, [-5, 0.2], true);
      axes(ctx, F, { xt: [0, 50, 100, 150, 200, 250], yt: [-4, -2, 0], fy: function (e) { return e === 0 ? "100%" : e === -2 ? "1%" : "0.01%"; }, xl: "fit start  (M after the peak)", yl: "error of the fitted frequency" });
      ctx.save();
      ctx.beginPath();
      ctx.rect(F.x0, F.y0 - 2, F.x1 - F.x0, F.y1 - F.y0 + 4);
      ctx.clip();
      ctx.strokeStyle = COL.acc;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      var started = false;
      errs.forEach(function (e, i) {
        if (!(e > 0)) {
          started = false;
          return;
        }
        var x = F.X(-10 + i);
        var yy = F.clampY(F.Y(e));
        if (started) ctx.lineTo(x, yy);
        else {
          ctx.moveTo(x, yy);
          started = true;
        }
      });
      ctx.stroke();
      ctx.restore();
      var e0 = errs[s.u0 + 10];
      if (e0 > 0) dot(ctx, F.X(s.u0), F.clampY(F.Y(e0)), 4, COL.ink, true);
    }

    function draw() {
      drawMain();
      drawErr();
    }

    var dragging = false;
    function fromPointer(e, p, Fget) {
      var F = Fget();
      if (!F) return;
      var r = p.c.getBoundingClientRect();
      var v = Math.round(F.invX(e.clientX - r.left));
      v = Math.max(-10, Math.min(210, v));
      if (v !== s.u0) {
        s.u0 = v;
        fitSlider.set(v);
        refit();
        draw();
      }
    }
    [[main, function () { return mainF; }], [errp, function () { return mainF; }]].forEach(function (pair) {
      var p = pair[0];
      p.c.style.cursor = "ew-resize";
      p.c.addEventListener("pointerdown", function (e) {
        dragging = true;
        p.c.setPointerCapture(e.pointerId);
        fromPointer(e, p, pair[1]);
      });
      p.c.addEventListener("pointermove", function (e) { if (dragging) fromPointer(e, p, pair[1]); });
      p.c.addEventListener("pointerup", function () { dragging = false; });
    });

    load();
    window.addEventListener("resize", draw);
    if (document.fonts) document.fonts.ready.then(draw);
  };

  /* ======================================================================
     Lesson 6. From M = 1 to hertz
     ====================================================================== */

  function hz(f) {
    if (f >= 1000) return (f / 1000).toPrecision(3) + " kHz";
    if (f >= 1) return f.toPrecision(3) + " Hz";
    if (f >= 1e-3) return (f * 1e3).toPrecision(3) + " mHz";
    if (f >= 1e-6) return (f * 1e6).toPrecision(3) + " μHz";
    return (f * 1e9).toPrecision(3) + " nHz";
  }
  function dur(t) {
    if (t < 1e-3) return (t * 1e6).toPrecision(3) + " μs";
    if (t < 1) return (t * 1e3).toPrecision(3) + " ms";
    if (t < 120) return t.toPrecision(3) + " s";
    if (t < 7200) return (t / 60).toPrecision(3) + " min";
    if (t < 172800) return (t / 3600).toPrecision(3) + " h";
    return (t / 86400).toPrecision(3) + " days";
  }
  function solar(m) {
    if (m < 1e4) return (m < 100 ? m.toPrecision(2) : m.toFixed(0)) + " M☉";
    var e = Math.floor(Math.log10(m));
    return (m / Math.pow(10, e)).toFixed(1) + "×10" + String(e).replace(/./g, function (c) { return "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]; }) + " M☉";
  }

  W.mass = function (fig) {
    var u = layout(fig);
    var band = panel(u.stage, "w-h-xs", "Ringing frequency of the black hole against the bands of gravitational-wave detectors");
    var wave = panel(u.stage, "w-h-sm", "The fundamental ringdown in physical time");
    var s = { lg: 1 };
    var sl = slider(u.ctrl, { label: "Mass", min: 0.5, max: 10, step: 0.01, value: s.lg, fmt: function (v) { return solar(Math.pow(10, v)); }, on: function (v) { s.lg = v; draw(); } });
    var presets = [["10 M☉", 1], ["62 M☉", Math.log10(62)], ["Sgr A*", Math.log10(4.3e6)], ["M87*", Math.log10(6.5e9)]];
    var pbox = make("div", "rw-field", u.ctrl);
    make("span", "w-label", pbox, "Examples");
    var pseg = make("div", "rw-seg", pbox);
    presets.forEach(function (p) {
      var b = make("button", null, pseg, p[0]);
      b.type = "button";
      b.addEventListener("click", function () {
        s.lg = p[1];
        sl.set(p[1]);
        draw();
      });
    });
    var read = readout(u.ctrl);

    var BANDS = [
      { a: 1e-9, b: 1e-7, name: "pulsar timing", short: "PTA" },
      { a: 1e-4, b: 1e-1, name: "LISA", short: "LISA" },
      { a: 10, b: 5e3, name: "LIGO · Virgo · KAGRA", short: "LVK" },
    ];

    function draw() {
      var M = Math.pow(10, s.lg);
      var TM = M * T_SUN;
      var w0 = QNM[2][0];
      var f = w0[0] / (TAU * TM);
      var tau = TM / -w0[1];
      read.textContent = "ℓ = 2, n = 0\n  f = " + hz(f) + "\n  τ = " + dur(tau) + "\nℓ = 3: " + hz(QNM[3][0][0] / (TAU * TM)) + "\nℓ = 4: " + hz(QNM[4][0][0] / (TAU * TM));

      if (band.fit()) {
        var ctx = band.ctx;
        var F = frame(band, [16, 22, 26, 22], [-9, 5], [0, 1]);
        ctx.save();
        BANDS.forEach(function (b) {
          var x0 = F.X(Math.log10(b.a));
          var x1 = F.X(Math.log10(b.b));
          ctx.fillStyle = "rgba(140, 188, 255, 0.09)";
          ctx.fillRect(x0, F.y0 + 6, x1 - x0, F.y1 - F.y0 - 6);
          ctx.strokeStyle = "rgba(140, 188, 255, 0.35)";
          ctx.strokeRect(Math.round(x0) + 0.5, Math.round(F.y0 + 6) + 0.5, Math.round(x1 - x0), Math.round(F.y1 - F.y0 - 6));
          ctx.font = "10.5px " + MONO;
          ctx.fillStyle = COL.ink3;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          var room = x1 - x0 - 10;
          var label = ctx.measureText(b.name).width <= room ? b.name : b.short;
          if (ctx.measureText(label).width <= room + 4) ctx.fillText(label, x0 + 5, F.y0 + 10);
        });
        ctx.strokeStyle = COL.axis;
        ctx.beginPath();
        ctx.moveTo(F.x0, Math.round(F.y1) + 0.5);
        ctx.lineTo(F.x1, Math.round(F.y1) + 0.5);
        ctx.stroke();
        ctx.fillStyle = COL.ink3;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        [-9, -6, -3, 0, 3].forEach(function (e) {
          ctx.fillText({ "-9": "1 nHz", "-6": "1 μHz", "-3": "1 mHz", 0: "1 Hz", 3: "1 kHz" }[e], F.X(e), F.y1 + 6);
        });
        [3, 4].forEach(function (l) {
          var x = F.X(Math.log10(QNM[l][0][0] / (TAU * TM)));
          ctx.strokeStyle = "rgba(237, 239, 243, 0.4)";
          ctx.beginPath();
          ctx.moveTo(x, F.y1 - 14);
          ctx.lineTo(x, F.y1);
          ctx.stroke();
        });
        var fx = F.X(Math.log10(f));
        ctx.strokeStyle = COL.ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(fx, F.y0);
        ctx.lineTo(fx, F.y1);
        ctx.stroke();
        dot(ctx, fx, F.y1, 3.5, COL.ink, true);
        ctx.restore();
      }

      if (wave.fit()) {
        var c2 = wave.ctx;
        var G = frame(wave, [20, 30, 28, 24], [0, 6], [-1.1, 1.1]);
        var xt = wave.w < 520 ? [0, 2, 4, 6] : [0, 1, 2, 3, 4, 5, 6];
        axes(c2, G, { xt: xt, fx: function (v) { return v === 0 ? "0" : dur(v * tau); }, zeroY: 0, yl: "the ringing, f and τ in real units" });
        var n = 900;
        var cyc = w0[0] / -w0[1];
        var ys = [];
        for (var i = 0; i <= n; i += 1) {
          var t = (6 * i) / n;
          ys.push(Math.exp(-t) * Math.cos(cyc * t));
        }
        signed(c2, n + 1, function (i) { return G.X((6 * i) / n); }, function (i) { return G.Y(ys[i]); }, function (i) { return ys[i]; }, 1.5);
      }
    }

    draw();
    window.addEventListener("resize", draw);
    if (document.fonts) document.fonts.ready.then(draw);
  };

  /* ---------- shared bits for the later lessons ---------- */

  function softmin(a, b, e) { return Math.min(a, b) - e * Math.log(1 + Math.exp(-Math.abs(a - b) / e)); }

  function nice(lo, hi, n) {
    var span = hi - lo;
    var raw = span / n;
    var p = Math.pow(10, Math.floor(Math.log10(raw)));
    var m = raw / p;
    var st = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
    var out = [];
    for (var v = Math.ceil(lo / st - 1e-9) * st; v <= hi + 1e-9 * span; v += st) out.push(Math.abs(v) < 1e-9 * span ? 0 : v);
    return { t: out, st: st };
  }
  function tick(v, st) { return v.toFixed(Math.max(0, -Math.floor(Math.log10(st) + 1e-9))); }

  function line(ctx, pts, color, width, dash) {
    ctx.save();
    ctx.beginPath();
    for (var i = 0; i < pts.length; i += 1) {
      if (i) ctx.lineTo(pts[i][0], pts[i][1]);
      else ctx.moveTo(pts[i][0], pts[i][1]);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1.5;
    ctx.lineJoin = "round";
    if (dash) ctx.setLineDash(dash);
    ctx.stroke();
    ctx.restore();
  }

  function clip(ctx, F) {
    ctx.beginPath();
    ctx.rect(F.x0, F.y0 - 2, F.x1 - F.x0, F.y1 - F.y0 + 4);
    ctx.clip();
  }

  function label(ctx, text, x, y, align, base, color) {
    ctx.save();
    ctx.font = "10.5px " + MONO;
    ctx.fillStyle = color || COL.ink3;
    ctx.textAlign = align || "left";
    ctx.textBaseline = base || "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function tag(ctx, text, x, y, align, color) {
    ctx.save();
    ctx.font = "10.5px " + MONO;
    var w = ctx.measureText(text).width;
    var x0 = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    ctx.fillStyle = "rgba(7, 9, 14, 0.82)";
    ctx.fillRect(x0 - 4, y - 8, w + 8, 16);
    ctx.restore();
    label(ctx, text, x, y, align, "middle", color);
  }

  function legend(ctx, F, items) {
    ctx.save();
    ctx.font = "10.5px " + MONO;
    var x = F.x0 + 10;
    var y = F.y0 + 10;
    items.forEach(function (it) {
      var w = ctx.measureText(it.name).width + 26;
      if (x + w > F.x1 - 6) { x = F.x0 + 10; y += 16; }
      ctx.strokeStyle = it.c;
      ctx.lineWidth = 1.6;
      ctx.setLineDash(it.dash || []);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 14, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COL.ink2;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(it.name, x + 19, y);
      x += w + 8;
    });
    ctx.restore();
  }

  function vline(ctx, F, x, color, dash) {
    ctx.save();
    ctx.strokeStyle = color || "rgba(237, 239, 243, 0.3)";
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, F.y0);
    ctx.lineTo(Math.round(x) + 0.5, F.y1);
    ctx.stroke();
    ctx.restore();
  }

  function hover(p, set) {
    p.c.addEventListener("pointermove", function (e) {
      var r = p.c.getBoundingClientRect();
      set(e.clientX - r.left, e.clientY - r.top);
    });
    p.c.addEventListener("pointerleave", function () { set(null, null); });
  }

  function loop(seen, fn) {
    var last = 0;
    if (!window.ASK) return;
    window.ASK.onFrame(function (clock) {
      var dt = Math.min(clock - last, 0.1);
      last = clock;
      if (still || !seen.on) return;
      fn(dt);
    });
  }

  function redraw(draw) {
    draw();
    window.addEventListener("resize", draw);
    if (document.fonts) document.fonts.ready.then(draw);
  }

  /* Kerr, M omega for (l, m, n) against the dimensionless spin chi. Leaver's
     angular and radial continued fractions solved together, followed in small
     steps of spin from the Schwarzschild values (computed for this course). */
  var KERR = {
    "220": [[0.0,0.373672,-0.088962],[0.05,0.380146,-0.088849],[0.1,0.387018,-0.088706],[0.15,0.394333,-0.088528],[0.2,0.402145,-0.088311],[0.25,0.410518,-0.088048],[0.3,0.419527,-0.087729],[0.35,0.429264,-0.087345],[0.4,0.439842,-0.086882],[0.45,0.451402,-0.086321],[0.5,0.464123,-0.085639],[0.55,0.478235,-0.084802],[0.6,0.494045,-0.083765],[0.65,0.511969,-0.082462],[0.7,0.5326,-0.080793],[0.75,0.556817,-0.078603],[0.8,0.586017,-0.07563],[0.85,0.622635,-0.071393],[0.9,0.671614,-0.064869],[0.95,0.74632,-0.053149],[0.96,0.767674,-0.049434],[0.97,0.793208,-0.04479],[0.98,0.825429,-0.03863],[0.99,0.870893,-0.02939]],
    "210": [[0.0,0.373672,-0.088962],[0.05,0.376931,-0.088897],[0.1,0.380432,-0.088798],[0.15,0.384197,-0.088664],[0.2,0.388248,-0.088489],[0.25,0.392615,-0.088268],[0.3,0.39733,-0.087995],[0.35,0.402436,-0.087662],[0.4,0.407979,-0.087257],[0.45,0.41402,-0.086767],[0.5,0.420632,-0.086173],[0.55,0.427909,-0.08545],[0.6,0.435968,-0.084564],[0.65,0.444968,-0.083466],[0.7,0.455121,-0.082085],[0.75,0.466727,-0.080309],[0.8,0.480231,-0.077955],[0.85,0.496337,-0.074688],[0.9,0.516291,-0.069804],[0.95,0.542693,-0.061372],[0.96,0.549213,-0.058791],[0.97,0.556329,-0.055644],[0.98,0.564155,-0.051643],[0.99,0.572749,-0.046208]],
    "200": [[0.0,0.373672,-0.088962],[0.05,0.373762,-0.088946],[0.1,0.374032,-0.088898],[0.15,0.374485,-0.088817],[0.2,0.375124,-0.0887],[0.25,0.375955,-0.088547],[0.3,0.376985,-0.088353],[0.35,0.378223,-0.088115],[0.4,0.379682,-0.087827],[0.45,0.381374,-0.087481],[0.5,0.383318,-0.087069],[0.55,0.385536,-0.086579],[0.6,0.388054,-0.085995],[0.65,0.390905,-0.085295],[0.7,0.394129,-0.084453],[0.75,0.397779,-0.083426],[0.8,0.401917,-0.082156],[0.85,0.406626,-0.080556],[0.9,0.412004,-0.078483],[0.95,0.418159,-0.075701],[0.96,0.419491,-0.075028],[0.97,0.420856,-0.074306],[0.98,0.422254,-0.073532],[0.99,0.423685,-0.072701]],
    "2-10": [[0.0,0.373672,-0.088962],[0.05,0.370637,-0.088997],[0.1,0.367812,-0.089004],[0.15,0.365183,-0.088983],[0.2,0.362738,-0.088935],[0.25,0.360469,-0.088862],[0.3,0.358366,-0.088763],[0.35,0.356423,-0.088637],[0.4,0.354633,-0.088484],[0.45,0.35299,-0.088302],[0.5,0.351491,-0.088091],[0.55,0.350132,-0.087846],[0.6,0.348911,-0.087566],[0.65,0.347824,-0.087247],[0.7,0.34687,-0.086884],[0.75,0.346048,-0.086472],[0.8,0.345356,-0.086003],[0.85,0.344793,-0.085471],[0.9,0.344359,-0.084865],[0.95,0.344049,-0.084174],[0.96,0.344002,-0.084024],[0.97,0.34396,-0.08387],[0.98,0.343922,-0.083713],[0.99,0.34389,-0.083551]],
    "2-20": [[0.0,0.373672,-0.088962],[0.05,0.367557,-0.08905],[0.1,0.361768,-0.089114],[0.15,0.356275,-0.089157],[0.2,0.351053,-0.089183],[0.25,0.346079,-0.089191],[0.3,0.341333,-0.089185],[0.35,0.336798,-0.089164],[0.4,0.332458,-0.089131],[0.45,0.328299,-0.089087],[0.5,0.324307,-0.089032],[0.55,0.320473,-0.088966],[0.6,0.316784,-0.088892],[0.65,0.313232,-0.088809],[0.7,0.309808,-0.088717],[0.75,0.306504,-0.088618],[0.8,0.303313,-0.088512],[0.85,0.300229,-0.0884],[0.9,0.297244,-0.088281],[0.95,0.294354,-0.088156],[0.96,0.293787,-0.08813],[0.97,0.293223,-0.088105],[0.98,0.292663,-0.088079],[0.99,0.292107,-0.088052]],
    "221": [[0.0,0.346711,-0.273915],[0.05,0.354101,-0.273232],[0.1,0.36191,-0.272452],[0.15,0.370183,-0.271562],[0.2,0.378976,-0.270546],[0.25,0.388353,-0.269383],[0.3,0.39839,-0.268049],[0.35,0.409183,-0.266512],[0.4,0.420847,-0.264733],[0.45,0.433527,-0.262661],[0.5,0.447407,-0.260225],[0.55,0.462728,-0.257331],[0.6,0.479807,-0.253847],[0.65,0.499079,-0.24958],[0.7,0.521161,-0.244238],[0.75,0.546964,-0.237357],[0.8,0.577922,-0.228149],[0.85,0.616508,-0.215152],[0.9,0.667658,-0.195252],[0.95,0.744582,-0.159687],[0.96,0.766349,-0.148458],[0.97,0.792272,-0.134453],[0.98,0.824852,-0.115917],[0.99,0.870645,-0.088175]]
  };

  function kerrAt(key, chi) {
    var rows = KERR[key];
    for (var i = 1; i < rows.length; i += 1) {
      if (chi <= rows[i][0] + 1e-9) {
        var a = rows[i - 1];
        var b = rows[i];
        var t = (chi - a[0]) / (b[0] - a[0]);
        return [a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
      }
    }
    var z = rows[rows.length - 1];
    return [z[1], z[2]];
  }

  /* ======================================================================
     Lesson 0. A cartoon of a merger
     ====================================================================== */

  W.chirp = function (fig) {
    var u = layout(fig);
    var view = panel(u.stage, "w-h-lg", "Cartoon of the gravitational wave from two black holes that spiral together, merge and ring down");
    var s = { lg: Math.log10(60), hx: null, model: true };
    var WR = kerrAt("220", 0.7);
    var T0 = -260;
    var T1 = 80;
    var N = 2601;
    var DT = (T1 - T0) / (N - 1);
    var ts = new Float64Array(N);
    var hs = new Float64Array(N);
    var ws = new Float64Array(N);
    var ph = 0;
    var top = 0;
    for (var i = 0; i < N; i += 1) {
      var t = T0 + DT * i;
      var early = t < 7.95;
      var wi = early ? 0.3 * Math.pow(8 / (8 - t), 0.375) : 1e3;
      var w = softmin(wi, WR[0], 0.02);
      var L = softmin(early ? (2 / 3) * Math.log(wi / 0.3) : 1e3, WR[1] * t, 0.3);
      if (i) ph += 0.5 * (w + ws[i - 1]) * DT;
      ts[i] = t;
      ws[i] = w;
      hs[i] = Math.exp(L) * Math.cos(ph);
      top = Math.max(top, Math.exp(L));
    }
    for (i = 0; i < N; i += 1) hs[i] /= top;
    var i0 = Math.round((20 - T0) / DT);
    var fitc = ampfit(hs, i0, Math.round((70 - T0) / DT), DT, WR);
    var PH = [
      { a: T0, b: -35, name: "inspiral", by: "post-Newtonian theory" },
      { a: -35, b: 12, name: "merger", by: "numerical relativity" },
      { a: 12, b: T1, name: "ringdown", by: "perturbation theory" },
    ];

    slider(u.ctrl, { label: "Mass of the final black hole", min: 0.7, max: 2.7, step: 0.01, value: s.lg, fmt: function (v) { return solar(Math.pow(10, v)); }, on: function (v) { s.lg = v; draw(); } });
    check(u.ctrl, { label: "Its fundamental quasinormal mode", value: true, swatch: "1.5px dashed " + COL.acc, on: function (v) { s.model = v; draw(); } });
    var read = readout(u.ctrl);

    function draw() {
      var M = Math.pow(10, s.lg);
      var unit = M * T_SUN * 1000; // ms per M
      read.textContent =
        "Final black hole\n  M = " + solar(M) + ", χ = 0.7\nIts fundamental mode, ℓ = m = 2\n  f = " + hz(WR[0] / (TAU * M * T_SUN)) + "\n  τ = " + dur((M * T_SUN) / -WR[1]) +
        "\nWave frequency at the left edge\n  " + hz(ws[0] / (TAU * M * T_SUN)) + "\nThe cartoon spans " + dur((T1 - T0) * M * T_SUN);
      if (!view.fit()) return;
      var ctx = view.ctx;
      var F = frame(view, [26, 14, 40, 14], [T0, T1], [-1.18, 1.18]);
      var tk = nice(T0 * unit, T1 * unit, view.w < 520 ? 4 : 7);
      axes(ctx, F, { xt: tk.t.map(function (v) { return v / unit; }), fx: function (v) { return tick(v * unit, tk.st); }, zeroY: 0, xl: "time from the peak  (ms)", yl: "strain, arbitrary units" });
      ctx.save();
      ctx.fillStyle = "rgba(140, 188, 255, 0.06)";
      ctx.fillRect(F.X(PH[1].a), F.y0, F.X(PH[1].b) - F.X(PH[1].a), F.y1 - F.y0);
      ctx.restore();
      PH.forEach(function (p, k) {
        var x = k === 0 ? F.x0 + 6 : k === 1 ? (F.X(p.a) + F.X(p.b)) / 2 : F.x1 - 4;
        label(ctx, p.name, x, F.y0 + 10, k === 0 ? "left" : k === 1 ? "center" : "right");
      });
      ctx.save();
      clip(ctx, F);
      ctx.beginPath();
      for (var i = 0; i < N; i += 1) {
        if (i) ctx.lineTo(F.X(ts[i]), F.Y(hs[i]));
        else ctx.moveTo(F.X(ts[i]), F.Y(hs[i]));
      }
      ctx.strokeStyle = COL.ink;
      ctx.lineWidth = 1.3;
      ctx.lineJoin = "round";
      ctx.stroke();
      if (s.model) {
        var pts = [];
        for (var t = 0; t <= T1; t += 0.25) {
          var z = t - 20;
          pts.push([F.X(t), F.Y(Math.exp(WR[1] * z) * (fitc[0] * Math.cos(WR[0] * z) + fitc[1] * Math.sin(WR[0] * z)))]);
        }
        line(ctx, pts, COL.acc, 1.8, [5, 4]);
      }
      ctx.restore();
      if (s.hx != null && s.hx >= F.x0 && s.hx <= F.x1) {
        var th = F.invX(s.hx);
        var j = Math.max(0, Math.min(N - 1, Math.round((th - T0) / DT)));
        var p = PH[th < PH[0].b ? 0 : th < PH[1].b ? 1 : 2];
        vline(ctx, F, s.hx);
        tooltip(ctx, view, s.hx, (F.y0 + F.y1) / 2, [
          { t: p.name, head: true },
          { t: "t = " + (th * unit).toFixed(1) + " ms" },
          { t: "wave frequency " + hz(ws[j] / (TAU * M * T_SUN)) },
          { t: "described by " + p.by },
        ]);
      }
    }
    hover(view, function (x) { s.hx = x; draw(); });
    redraw(draw);
  };

  /* ======================================================================
     Lesson 2. Two rulers
     ====================================================================== */

  W.rulers = function (fig) {
    var u = layout(fig);
    var view = panel(u.stage, "w-h-md", "Light pulses moving radially, drawn on a ruler in radius r and on a ruler in the tortoise coordinate r*");
    var s = { dir: "in", t: 0, run: true };
    var seen = visibility(fig);
    var GAP = 3;
    var RS = [-26, rStar(12)];
    var SPAN = RS[1] - RS[0];
    seg(u.ctrl, { label: "Light", options: [["in", "falling in"], ["out", "climbing out"]], value: "in", on: function (v) { s.dir = v; s.t = 0; draw(); } });
    var pb = button(u.ctrl, "Pause", function () { s.run = !s.run; pb.textContent = s.run ? "Pause" : "Play"; });
    var read = readout(u.ctrl);

    function pulses() {
      var out = [];
      var n = Math.ceil(SPAN / GAP) + 1;
      for (var k = 0; k < n; k += 1) {
        var d = (s.t + k * GAP) % (n * GAP);
        var x = s.dir === "in" ? RS[1] - d : RS[0] + d;
        if (x >= RS[0] && x <= RS[1]) out.push(x);
      }
      return out;
    }

    function ruler(ctx, F, y, ticks, fmt, name, left) {
      ctx.save();
      ctx.strokeStyle = COL.axis;
      ctx.beginPath();
      ctx.moveTo(F.x0, Math.round(y) + 0.5);
      ctx.lineTo(F.x1, Math.round(y) + 0.5);
      ticks.forEach(function (v) {
        var x = Math.round(F.X(v)) + 0.5;
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x, y + 4);
      });
      ctx.stroke();
      ctx.restore();
      ticks.forEach(function (v) { label(ctx, fmt(v), F.X(v), y + 8, "center", "top"); });
      label(ctx, name, F.x1, y - 10, "right", "bottom");
      label(ctx, left, F.x0, y - 10, "left", "bottom");
    }

    function draw() {
      var xs = pulses();
      var near = s.dir === "in" ? Math.min.apply(null, xs.concat([RS[1]])) : Math.min.apply(null, xs.concat([RS[1]]));
      var rn = rOf(near) - 2;
      read.textContent =
        "A pulse leaves every 3M of time t.\nOn the r* ruler they stay 3M apart\nand move at the speed of light.\nOn the r ruler they " + (s.dir === "in" ? "pile up at the horizon.\nClosest: r − 2M = " : "crawl away from the horizon.\nNewest: r − 2M = ") + rn.toExponential(1) + " M";
      if (!view.fit()) return;
      var ctx = view.ctx;
      var Ft = frame(view, [0, 18, 0, 18], [2, 12], [0, 1]);
      var Fb = frame(view, [0, 18, 0, 18], RS, [0, 1]);
      var yt = Math.round(view.h * 0.3);
      var yb = Math.round(view.h * 0.74);
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(Ft.x0 - 18, yt - 9, 18, 18);
      ctx.restore();
      ruler(ctx, Ft, yt, [2, 4, 6, 8, 10, 12], function (v) { return String(v); }, "radius r / M", "horizon, r = 2M");
      ruler(ctx, Fb, yb, [-20, -10, 0, 10], function (v) { return String(v); }, "tortoise r* / M", "← r* → −∞ at the horizon");
      ctx.save();
      xs.forEach(function (x) {
        var r = rOf(x);
        var a = Fb.X(x);
        var b = Ft.X(Math.min(12, r));
        ctx.strokeStyle = "rgba(255, 178, 122, 0.22)";
        ctx.beginPath();
        ctx.moveTo(a, yb - 5);
        ctx.lineTo(b, yt + 5);
        ctx.stroke();
        dot(ctx, a, yb, 3.2, COL.pulse, true);
        dot(ctx, b, yt, 3.2, COL.pulse, true);
      });
      ctx.restore();
    }

    loop(seen, function (dt) {
      if (!s.run) return;
      s.t += dt * 5;
      draw();
    });
    redraw(draw);
  };

  /* ======================================================================
     Lesson 2. Light around the hole
     ====================================================================== */

  // A light ray from far away with impact parameter b, as u = 1/r against phi:
  // u'' = 3u^2 - u (M = 1). Starts at r = 60 at height b.
  function photon(b) {
    var u0 = 1 / 60;
    var u = u0;
    var ph0 = Math.asin(Math.min(1, b * u0));
    var ph = ph0;
    var d = Math.sqrt(Math.max(0, 1 / (b * b) - u * u * (1 - 2 * u)));
    var h = 0.004;
    var pts = [[ph, u]];
    var captured = false;
    var umax = u;
    for (var k = 0; k < 40000; k += 1) {
      var a1 = 3 * u * u - u;
      var uA = u + 0.5 * h * d, dA = d + 0.5 * h * a1;
      var a2 = 3 * uA * uA - uA;
      var uB = u + 0.5 * h * dA, dB = d + 0.5 * h * a2;
      var a3 = 3 * uB * uB - uB;
      var uC = u + h * dB, dC = d + h * a3;
      var a4 = 3 * uC * uC - uC;
      u += (h / 6) * (d + 2 * dA + 2 * dB + dC);
      d += (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
      ph += h;
      umax = Math.max(umax, u);
      if (k % 3 === 0) pts.push([ph, u]);
      if (u >= 0.5) { captured = true; pts.push([ph, 0.5]); break; }
      if (u < u0) break;
      if (ph > 9 * Math.PI) break;
    }
    pts.push([ph, Math.max(u, 1e-3)]);
    return { pts: pts, captured: captured, sweep: ph - ph0, ph0: ph0, rmin: 1 / umax };
  }

  W.light = function (fig) {
    var u = layout(fig);
    var pair = make("div", "w-pair", u.stage);
    var orbit = panel(pair, "w-h-lg", "Light rays passing a black hole, with the light ring at three times the mass");
    var pot = panel(pair, "w-h-lg", "The effective potential for light and the level set by the impact parameter");
    var s = { b: 6 };
    var fan = [1.5, 3, 4.2, 5, 5.4, 6.3, 7.5, 9].map(photon);
    var ray = photon(s.b);
    var BC = Math.sqrt(27);
    var sl = slider(u.ctrl, { label: "Impact parameter b", min: 1, max: 10, step: "any", value: s.b, fmt: function (v) { return v.toFixed(3) + "M"; }, on: function (v) { s.b = v; ray = photon(v); draw(); } });
    button(u.ctrl, "Graze the light ring", function () { s.b = BC + 2e-5; sl.set(s.b); ray = photon(s.b); draw(); });
    var read = readout(u.ctrl);

    function drawOrbit() {
      if (!orbit.fit()) return;
      var ctx = orbit.ctx;
      var sc = Math.min(orbit.w, orbit.h) / 25;
      var cx = orbit.w / 2;
      var cy = orbit.h / 2;
      function P(ph, uu) { var r = 1 / uu; return [cx + r * Math.cos(ph) * sc, cy - r * Math.sin(ph) * sc]; }
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 3 * sc, 0, TAU);
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = "rgba(140, 188, 255, 0.55)";
      ctx.stroke();
      ctx.setLineDash([]);
      fan.forEach(function (f) { line(ctx, f.pts.map(function (q) { return P(q[0], q[1]); }), "rgba(237, 239, 243, 0.16)", 1); });
      line(ctx, ray.pts.map(function (q) { return P(q[0], q[1]); }), COL.pulse, 1.8);
      ctx.beginPath();
      ctx.arc(cx, cy, 2 * sc, 0, TAU);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.strokeStyle = COL.axis;
      ctx.stroke();
      ctx.restore();
      label(ctx, "light ring, r = 3M", cx, cy - 3 * sc - 8, "center", "bottom", COL.acc);
      label(ctx, "light comes in from the right →", orbit.w - 8, orbit.h - 8, "right", "bottom");
    }

    function drawPot() {
      if (!pot.fit()) return;
      var ctx = pot.ctx;
      var F = frame(pot, [24, 14, 40, 46], [2, 14], [0, 0.045]);
      axes(ctx, F, { xt: [2, 6, 10, 14], yt: [0, 0.02, 0.04], fy: function (v) { return v.toFixed(2); }, xl: "r / M", yl: "(1 − 2M/r) / r²" });
      var pts = [];
      for (var i = 0; i <= 300; i += 1) {
        var r = 2 + (12 * i) / 300;
        pts.push([F.X(r), F.Y((1 - 2 / r) / (r * r))]);
      }
      line(ctx, pts, COL.ink, 1.7);
      var lev = 1 / (s.b * s.b);
      ctx.save();
      clip(ctx, F);
      line(ctx, [[F.x0, F.Y(lev)], [F.x1, F.Y(lev)]], COL.pulse, 1.4, [5, 4]);
      ctx.restore();
      if (lev < 0.045) label(ctx, "1/b²", F.x1 - 4, F.Y(lev) - 8, "right", "bottom", COL.pulse);
      label(ctx, "1/27 at r = 3M", F.X(3) + 8, F.Y(1 / 27) - 8, "left", "bottom");
      if (s.b > BC) {
        var rt = ((2 * s.b) / Math.sqrt(3)) * Math.cos(Math.acos((-3 * Math.sqrt(3)) / s.b) / 3);
        if (rt < 14) dot(ctx, F.X(rt), F.Y(lev), 3.5, COL.pulse, true);
      }
    }

    function draw() {
      var txt = "Impact parameter b = " + s.b.toFixed(3) + "M\nCritical value 3√3 M = 5.196M\n";
      if (ray.captured) txt += "Captured, after going " + (ray.sweep / TAU).toFixed(2) + " times round.";
      else txt += "Escapes. Closest approach " + ray.rmin.toFixed(2) + "M,\ndeflected by " + (((ray.sweep - (Math.PI - 2 * ray.ph0)) * 180) / Math.PI).toFixed(0) + "°.";
      read.textContent = txt;
      drawOrbit();
      drawPot();
    }
    redraw(draw);
  };

  /* ======================================================================
     Lesson 3. A wave meets the barrier
     ====================================================================== */

  var transCache = {};
  // fraction of the energy of a Gaussian packet that gets through, from the
  // stationary transmission averaged over the packet's frequencies
  function packetTransmission(l, sp, nu, sig) {
    var key = [l, sp, nu, sig].join(":");
    if (transCache[key] != null) return transCache[key];
    var num = 0, den = 0;
    var lo = Math.max(0.01, nu - 4 / sig);
    var hi = nu + 4 / sig;
    for (var i = 0; i <= 40; i += 1) {
      var w = lo + ((hi - lo) * i) / 40;
      var g = Math.exp((-(w - nu) * (w - nu) * sig * sig) / 2) + Math.exp((-(w + nu) * (w + nu) * sig * sig) / 2);
      var wt = w * w * g * g;
      num += wt * transmit(w, l, sp).T2;
      den += wt;
    }
    return (transCache[key] = num / den);
  }

  W.barrier = function (fig) {
    var u = layout(fig);
    var view = panel(u.stage, "w-h-md", "A wave packet of a scalar field meeting the potential barrier of a black hole");
    var s = { l: 1, nu: 0.3 };
    var seen = visibility(fig);
    var play = { t: 0, hold: 0 };
    var sim = null;
    var pk = null;
    var stat = null;
    var SRC = 80;
    var SIG = 10;
    var VIEW = [-150, 200];
    seg(u.ctrl, { label: "Multipole ℓ", options: [[0, "0"], [1, "1"], [2, "2"], [3, "3"]], value: 1, on: function (v) { s.l = v; queue(); } });
    slider(u.ctrl, { label: "Frequency of the packet  Mω", min: 0.05, max: 0.8, step: 0.01, value: s.nu, fmt: f2, on: function (v) { s.nu = v; queue(); } });
    button(u.ctrl, "Replay", function () { play.t = 0; play.hold = 0; });
    var read = readout(u.ctrl);

    var pending = 0;
    function queue() {
      if (pending) return;
      pending = window.requestAnimationFrame(function () {
        pending = 0;
        run();
      });
    }

    function run() {
      var l = s.l;
      var nu = s.nu;
      pk = peak("s0", l);
      sim = evolve({
        x0: -260,
        x1: 320,
        dx: 0.25,
        T: 210,
        obs: 0,
        V: function (x) { return POT.s0(rOf(x), l); },
        init: function (x) { var z = x - SRC; return Math.exp(-(z * z) / (2 * SIG * SIG)) * Math.cos(nu * z); },
        snap: { x0: VIEW[0], x1: VIEW[1], dx: 0.5, dt: 1 },
        split: pk.rs,
      });
      stat = packetTransmission(l, 0, nu, SIG);
      play.t = 0;
      play.hold = 0;
      var tot = sim.E[0] + sim.E[1];
      read.textContent =
        "Top of the barrier\n  V₀ = " + pk.V0.toFixed(4) + ",  √V₀ = " + Math.sqrt(pk.V0).toFixed(3) + "\nPacket\n  Mω = " + nu.toFixed(2) + ",  (Mω)² = " + (nu * nu).toFixed(4) +
        "\nAfter the encounter\n  reflected   " + ((100 * sim.E[1]) / tot).toFixed(1) + " %\n  transmitted " + ((100 * sim.E[0]) / tot).toFixed(1) + " %\nStationary result, Lesson 5\n  transmitted " + (100 * stat).toFixed(1) + " %";
      draw();
    }

    function draw() {
      if (!sim || !view.fit()) return;
      var ctx = view.ctx;
      var F = frame(view, [18, 12, 28, 12], VIEW, [-1.12, 1.12]);
      var base = F.Y(0);
      var sc = 0.85 / pk.V0;
      ctx.save();
      ctx.fillStyle = "rgba(140, 188, 255, 0.10)";
      ctx.strokeStyle = "rgba(140, 188, 255, 0.55)";
      ctx.beginPath();
      ctx.moveTo(F.x0, base);
      for (var i = 0; i <= 350; i += 1) {
        var x = VIEW[0] + ((VIEW[1] - VIEW[0]) * i) / 350;
        ctx.lineTo(F.X(x), F.Y(sc * POT.s0(rOf(x), s.l)));
      }
      ctx.lineTo(F.x1, base);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = COL.axis;
      ctx.beginPath();
      ctx.moveTo(F.x0, Math.round(base) + 0.5);
      ctx.lineTo(F.x1, Math.round(base) + 0.5);
      ctx.stroke();
      var ly = F.Y(sc * s.nu * s.nu);
      if (ly > F.y0 - 2) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = "rgba(255, 178, 122, 0.6)";
        ctx.beginPath();
        ctx.moveTo(F.X(-30), ly);
        ctx.lineTo(F.X(40), ly);
        ctx.stroke();
        ctx.setLineDash([]);
        label(ctx, "ω² of the packet", F.X(42), ly, "left", "middle", COL.pulse);
      } else label(ctx, "ω² of the packet: off the top", F.X(42), F.y0 + 4, "left", "top", COL.pulse);
      ctx.restore();
      label(ctx, "← to the horizon", F.x0, F.y1 + 8, "left", "top");
      label(ctx, "to infinity →", F.x1, F.y1 + 8, "right", "top");
      label(ctx, "r*", F.X(0), F.y1 + 8, "center", "top");
      var k = Math.min(sim.snaps.length - 1, Math.floor(play.t / sim.snapDt));
      if (still) k = sim.snaps.length - 1;
      var snap = sim.snaps[k];
      var dxs = sim.snapDx;
      signed(ctx, snap.length, function (j) { return F.X(VIEW[0] + j * dxs); }, function (j) { return F.Y(snap[j]); }, function (j) { return snap[j]; }, 1.5);
      label(ctx, "t = " + (k * sim.snapDt).toFixed(0) + "M", F.x0, F.y0 - 4, "left", "middle");
    }

    loop(seen, function (dt) {
      if (!sim) return;
      var T = (sim.snaps.length - 1) * sim.snapDt;
      if (play.t >= T) {
        play.hold += dt;
        if (play.hold > 1.5) {
          play.t = 0;
          play.hold = 0;
        }
      } else play.t = Math.min(T, play.t + dt * 30);
      draw();
    });
    run();
    window.addEventListener("resize", draw);
    if (document.fonts) document.fonts.ready.then(draw);
  };

  /* ======================================================================
     Lesson 5. How much gets through
     ====================================================================== */

  W.greybody = function (fig) {
    var u = layout(fig);
    var tp = panel(u.stage, "w-h-md", "Fraction of a wave that gets through the barrier, against frequency, for four multipoles");
    var sp = panel(u.stage, "w-h-md", "Absorption cross-section of a Schwarzschild black hole for a massless scalar field");
    var s = { sp: 0, wkb: false, pt: false, hx: null, hx2: null };
    var seen = visibility(fig);
    var WS = [];
    for (var q = 1; q <= 240; q += 1) WS.push(0.005 * q);
    var LS = { 0: [0, 1, 2, 3], 2: [2, 3, 4, 5] };
    var LC = [COL.ink, COL.acc, COL.pulse, COL.ink3];
    var data = {};
    var sigma = null;
    var started = false;

    seg(u.ctrl, { label: "Field", options: [[0, "scalar"], [2, "gravitational"]], value: 0, on: function (v) { s.sp = v; ensure(); draw(); } });
    var box = make("div", "rw-field", u.ctrl);
    make("span", "w-label", box, "Approximations");
    check(box, { label: "WKB, first order", value: false, swatch: "1.5px dashed " + COL.ink2, on: function (v) { s.wkb = v; draw(); } });
    check(box, { label: "Pöschl–Teller", value: false, swatch: "1.5px dotted " + COL.ink2, on: function (v) { s.pt = v; draw(); } });
    var read = readout(u.ctrl);

    function approxT(kind, l) {
      var p = peak(kind, l);
      var al = Math.sqrt(-p.V2 / (2 * p.V0));
      var c = Math.cosh(Math.PI * Math.sqrt(Math.max(0, p.V0 / (al * al) - 0.25)));
      return {
        p: p,
        al: al,
        wkb: function (w) { return 1 / (1 + Math.exp((TAU * (p.V0 - w * w)) / Math.sqrt(-2 * p.V2))); },
        pt: function (w) { var sh = Math.sinh((Math.PI * w) / al); return (sh * sh) / (sh * sh + c * c); },
      };
    }

    function ensure() {
      if (data[s.sp]) return;
      var spin = s.sp;
      var T = {};
      var A = {};
      LS[spin].forEach(function (l) {
        var arr = new Float64Array(WS.length);
        for (var i = 0; i < WS.length; i += 1) arr[i] = transmit(WS[i], l, spin).T2;
        T[l] = arr;
        A[l] = approxT(spin ? "rw" : "s0", l);
      });
      data[spin] = { T: T, A: A };
      if (!sigma) {
        sigma = new Float64Array(WS.length);
        for (var i = 0; i < WS.length; i += 1) {
          var w = WS[i];
          var tot = 0;
          for (var l = 0; l < 40; l += 1) {
            var t2 = spin === 0 && l <= 3 ? T[l][i] : transmit(w, l, 0).T2;
            tot += (2 * l + 1) * t2;
            if (l > 2 && t2 < 1e-7) break;
          }
          sigma[i] = tot / (w * w);
        }
      }
    }

    function half(arr) {
      for (var i = 1; i < arr.length; i += 1) {
        if (arr[i - 1] < 0.5 && arr[i] >= 0.5) return WS[i - 1] + (0.005 * (0.5 - arr[i - 1])) / (arr[i] - arr[i - 1]);
      }
      return NaN;
    }

    function drawT() {
      if (!tp.fit()) return;
      var ctx = tp.ctx;
      var F = frame(tp, [24, 14, 40, 46], [0, 1.2], [0, 1.08]);
      axes(ctx, F, { xt: [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2], yt: [0, 0.5, 1], fx: function (v) { return v.toFixed(1); }, fy: function (v) { return v.toFixed(1); }, xl: "Mω", yl: "|T|², fraction transmitted" });
      var D = data[s.sp];
      if (!D) { label(ctx, "computing…", (F.x0 + F.x1) / 2, (F.y0 + F.y1) / 2, "center"); return; }
      ctx.save();
      clip(ctx, F);
      LS[s.sp].forEach(function (l, k) {
        var arr = D.T[l];
        var pts = [[F.X(0), F.Y(0)]];
        for (var i = 0; i < WS.length; i += 1) pts.push([F.X(WS[i]), F.Y(arr[i])]);
        line(ctx, pts, LC[k], 1.7);
        var A = D.A[l];
        [["wkb", [5, 4]], ["pt", [1.5, 3]]].forEach(function (m) {
          if (!s[m[0]]) return;
          var ap = [];
          for (var j = 0; j <= 240; j += 1) { var w = 0.005 * j; ap.push([F.X(w), F.Y(A[m[0]](w))]); }
          line(ctx, ap, LC[k], 1.3, m[1]);
        });
      });
      ctx.restore();
      LS[s.sp].forEach(function (l, k) {
        var wh = half(D.T[l]);
        if (wh > 0) label(ctx, "ℓ = " + l, F.X(wh) + 6, F.Y(0.5) + (k % 2 ? 14 : -14), "left", "middle", LC[k]);
      });
      if (s.hx != null && s.hx >= F.x0 && s.hx <= F.x1) {
        var w = F.invX(s.hx);
        var i = Math.max(0, Math.min(WS.length - 1, Math.round(w / 0.005) - 1));
        vline(ctx, F, s.hx);
        var lines = [{ t: "Mω = " + WS[i].toFixed(3), head: true }];
        LS[s.sp].forEach(function (l, k) {
          var v = D.T[l][i];
          dot(ctx, F.X(WS[i]), F.Y(v), 3, LC[k], true);
          lines.push({ t: "ℓ = " + l + "   " + (v < 1e-3 ? v.toExponential(1) : v.toFixed(3)), c: LC[k] });
        });
        tooltip(ctx, tp, s.hx, (F.y0 + F.y1) / 2, lines);
      }
    }

    function drawS() {
      if (!sp.fit()) return;
      var ctx = sp.ctx;
      var F = frame(sp, [24, 14, 40, 46], [0, 1.2], [0, 36]);
      axes(ctx, F, { xt: [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2], yt: [0, 16, 27], fx: function (v) { return v.toFixed(1); }, xl: "Mω", yl: "σ / πM², scalar field" });
      var G = [[16, "16πM², the area of the horizon"], [27, "27πM², capture of light"]];
      G.forEach(function (g) { line(ctx, [[F.x0, F.Y(g[0])], [F.x1, F.Y(g[0])]], "rgba(237, 239, 243, 0.35)", 1, [2, 4]); });
      if (sigma) {
        var pts = [];
        for (var i = 0; i < WS.length; i += 1) pts.push([F.X(WS[i]), F.Y(sigma[i])]);
        ctx.save();
        clip(ctx, F);
        line(ctx, pts, COL.acc, 1.8);
        ctx.restore();
      }
      G.forEach(function (g) { tag(ctx, g[1], F.x1 - 8, F.Y(g[0]) + (g[0] === 16 ? 12 : -14), "right"); });
      if (!sigma) { label(ctx, "computing…", (F.x0 + F.x1) / 2, (F.y0 + F.y1) / 2, "center"); return; }
      if (s.hx2 != null && s.hx2 >= F.x0 && s.hx2 <= F.x1) {
        var j = Math.max(0, Math.min(WS.length - 1, Math.round(F.invX(s.hx2) / 0.005) - 1));
        vline(ctx, F, s.hx2);
        dot(ctx, F.X(WS[j]), F.Y(sigma[j]), 3, COL.acc, true);
        tooltip(ctx, sp, s.hx2, (F.y0 + F.y1) / 2, [{ t: "Mω = " + WS[j].toFixed(3), head: true }, { t: "σ = " + sigma[j].toFixed(2) + " πM²", c: COL.acc }]);
      }
    }

    function draw() {
      var D = data[s.sp];
      if (D) {
        var txt = "Half gets through, |T|² = ½, at\n";
        LS[s.sp].forEach(function (l) {
          txt += "  ℓ = " + l + "   Mω = " + half(D.T[l]).toFixed(3) + "\n";
        });
        txt += "Top of each barrier, √V₀\n  ";
        txt += LS[s.sp].map(function (l) { return Math.sqrt(D.A[l].p.V0).toFixed(3); }).join("  ");
        read.textContent = txt;
      } else read.textContent = "Integrating the wave equation…";
      drawT();
      drawS();
    }

    function start() {
      if (started) return;
      started = true;
      window.setTimeout(function () { ensure(); draw(); }, 30);
    }
    hover(tp, function (x) { s.hx = x; drawT(); });
    hover(sp, function (x) { s.hx2 = x; drawS(); });
    redraw(draw);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { if (es[es.length - 1].isIntersecting) start(); }, { rootMargin: "300px" }).observe(fig);
    } else start();
  };

  /* ======================================================================
     Lesson 7. Where the ringing comes from
     ====================================================================== */

  W.contour = function (fig) {
    var u = layout(fig);
    var view = panel(u.stage, "w-h-lg", "The complex frequency plane, with the quasinormal poles, the branch cut and the contour of the frequency integral");
    var s = { mode: "line", hx: null, hy: null };
    var NP = 7;
    seg(u.ctrl, { label: "Contour", options: [["line", "along the real axis"], ["closed", "pushed down"]], value: "line", on: function (v) { s.mode = v; draw(); } });
    var read = readout(u.ctrl);
    var F = null;

    function arrow(ctx, x, y, ang, col) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function draw() {
      read.textContent = s.mode === "line"
        ? "The response to any kick is an integral\nover real frequencies, run just above\nthe axis so that nothing happens\nbefore the kick."
        : "Push the contour down and it snags on\n  the poles: one damped sinusoid each,\n  the quasinormal ringing;\n  the branch cut: the late-time tail;\n  the large arc: the prompt response.";
      if (!view.fit()) return;
      var ctx = view.ctx;
      F = frame(view, [24, 14, 40, 46], [-1.05, 1.05], [-1.62, 0.32]);
      axes(ctx, F, { xt: [-1, -0.5, 0, 0.5, 1], yt: [-1.5, -1, -0.5, 0], fx: function (v) { return v.toFixed(1); }, fy: function (v) { return v.toFixed(1); }, zeroY: 0, zeroX: 0, xl: "Re Mω", yl: "Im Mω" });
      // branch cut
      ctx.save();
      clip(ctx, F);
      var zx = F.X(0);
      ctx.strokeStyle = COL.pulse;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (var k = 0, y = F.Y(0); y < F.y1; k += 1, y += 5) ctx.lineTo(zx + (k % 2 ? 3 : -3), y);
      ctx.stroke();
      var on = s.mode === "closed";
      var c = on ? "rgba(140, 188, 255, 0.28)" : COL.acc;
      var yl = F.Y(0.16);
      line(ctx, [[F.x0, yl], [F.x1, yl]], c, 1.6);
      arrow(ctx, F.X(-0.5), yl, 0, c);
      arrow(ctx, F.X(0.5), yl, 0, c);
      if (on) {
        // large arc
        var rx = (F.X(0.98) - F.X(-0.98)) / 2;
        var ry = F.Y(-1.52) - F.Y(0);
        ctx.strokeStyle = COL.acc;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(F.X(0), F.Y(0), rx, ry, 0, 0.04, Math.PI - 0.04);
        ctx.stroke();
        arrow(ctx, F.X(0) + rx * Math.cos(0.7), F.Y(0) + ry * Math.sin(0.7), 0.7 + Math.PI / 2, COL.acc);
        // keyhole around the cut
        var gx = 6;
        ctx.beginPath();
        ctx.moveTo(zx - gx, F.Y(0) + ry * 0.999);
        ctx.lineTo(zx - gx, F.Y(0) + 7);
        ctx.arc(zx, F.Y(0) + 7, gx, Math.PI, 0, false);
        ctx.lineTo(zx + gx, F.Y(0) + ry * 0.999);
        ctx.stroke();
        // small circles round the poles
        for (var n = 0; n < NP; n += 1) {
          [1, -1].forEach(function (sg) {
            ctx.beginPath();
            ctx.arc(F.X(sg * QNM[2][n][0]), F.Y(QNM[2][n][1]), 8, 0, TAU);
            ctx.stroke();
          });
        }
      }
      ctx.restore();
      for (var m = 0; m < NP; m += 1) {
        dot(ctx, F.X(QNM[2][m][0]), F.Y(QNM[2][m][1]), 3.2, COL.ink, true);
        dot(ctx, F.X(-QNM[2][m][0]), F.Y(QNM[2][m][1]), 3.2, COL.ink, true);
      }
      label(ctx, on ? "the contour, pushed down" : "the contour, just above the axis", F.x1 - 4, yl - 9, "right", "bottom", COL.acc);
      if (on) {
        label(ctx, "poles: ringing", F.X(QNM[2][0][0]) + 12, F.Y(QNM[2][0][1]), "left", "middle", COL.ink);
        label(ctx, "cut: tail", zx + 10, F.Y(-1.0), "left", "middle", COL.pulse);
        label(ctx, "arc: prompt response", F.X(-0.62), F.Y(-1.42), "center", "middle", COL.acc);
      } else {
        label(ctx, "poles, ℓ = 2", F.X(QNM[2][0][0]) + 10, F.Y(QNM[2][0][1]), "left", "middle", COL.ink);
        label(ctx, "branch cut", zx + 10, F.Y(-1.0), "left", "middle", COL.pulse);
      }
      if (s.hx != null) {
        for (var p = 0; p < NP; p += 1) {
          for (var sg = -1; sg <= 1; sg += 2) {
            var px = F.X(sg * QNM[2][p][0]);
            var py = F.Y(QNM[2][p][1]);
            if (Math.hypot(px - s.hx, py - s.hy) < 9) {
              tooltip(ctx, view, px, py, [{ t: "n = " + p + (sg < 0 ? ", mirror" : ""), head: true }, { t: "Mω = " + cplx(sg * QNM[2][p][0], QNM[2][p][1], 4) }, { t: "decays in " + (1 / -QNM[2][p][1]).toFixed(1) + "M" }]);
            }
          }
        }
      }
    }
    hover(view, function (x, y) { s.hx = x; s.hy = y; draw(); });
    redraw(draw);
  };

  W.excite = function (fig) {
    var u = layout(fig);
    var spec = panel(u.stage, "w-h-sm", "Spectrum of the wave packet, with the pitches of the black hole's first modes");
    var resp = panel(u.stage, "w-h-md", "Amplitude of the fundamental mode against the frequency of the packet, measured in simulations and predicted from the packet's spectrum");
    var s = { nu: 0.37 };
    var seen = visibility(fig);
    var SIG2 = 72;
    var X0 = 50;
    var W0 = QNM[2][0];
    var NU = [];
    for (var q = 0; q <= 16; q += 1) NU.push(0.05 * q);
    var meas = NU.map(function () { return null; });
    var started = false;

    // projection of the packet on the mode: | int e^{i w x} u(x) (g' - i w g) dx |
    var XS = [];
    var EU = [];
    for (var x = 8; x <= 92; x += 0.1) {
      var fs = farSeries([W0[0], W0[1]], rOf(x), 6, -6, 1);
      var e = Math.exp(-W0[1] * x);
      XS.push(x);
      EU.push(cm([e * Math.cos(W0[0] * x), e * Math.sin(W0[0] * x)], fs.u));
    }
    function predict(nu) {
      var re = 0, im = 0;
      for (var i = 0; i < XS.length; i += 1) {
        var z = XS[i] - X0;
        var g0 = Math.exp((-z * z) / SIG2);
        var g = g0 * Math.cos(nu * z);
        var gp = g0 * ((-2 * z * Math.cos(nu * z)) / SIG2 - nu * Math.sin(nu * z));
        var h = [gp + W0[1] * g, -W0[0] * g];
        var v = cm(EU[i], h);
        re += v[0];
        im += v[1];
      }
      return Math.hypot(re, im);
    }
    var PN = [];
    var pmax = 0;
    var pbest = 0;
    for (var j = 0; j <= 160; j += 1) {
      var pv = predict(0.005 * j);
      PN.push(pv);
      if (pv > pmax) { pmax = pv; pbest = 0.005 * j; }
    }
    var scale = null;

    function measure(i) {
      var nu = NU[i];
      var S = evolve({
        x0: -300,
        x1: 600,
        dx: 0.2,
        T: 240,
        obs: 100,
        V: function (x) { return POT.rw(rOf(x), 2); },
        init: function (x) { var z = x - X0; return Math.exp((-z * z) / SIG2) * Math.cos(nu * z); },
      });
      var c = ampfit(S.y, Math.round(190 / S.dt), Math.round(230 / S.dt), S.dt, W0);
      meas[i] = Math.hypot(c[0], c[1]);
      var num = 0, den = 0;
      for (var k = 0; k < NU.length; k += 1) {
        if (meas[k] == null || NU[k] < 0.2) continue;
        var pp = PN[Math.round(NU[k] / 0.005)];
        num += meas[k] * pp;
        den += pp * pp;
      }
      if (den) scale = num / den;
    }

    var nuSlider = slider(u.ctrl, { label: "Frequency of the packet  ν", min: 0, max: 0.8, step: 0.005, value: s.nu, fmt: f3, on: function (v) { s.nu = v; draw(); } });
    var read = readout(u.ctrl);
    var RF = null;

    function drawSpec() {
      if (!spec.fit()) return;
      var ctx = spec.ctx;
      var F = frame(spec, [22, 14, 40, 46], [0, 1], [0, 1.15]);
      axes(ctx, F, { xt: [0, 0.2, 0.4, 0.6, 0.8, 1], yt: [0, 1], fx: function (v) { return v.toFixed(1); }, xl: "frequency  Mω", yl: "spectrum of the packet" });
      ctx.save();
      clip(ctx, F);
      ctx.beginPath();
      ctx.moveTo(F.X(0), F.Y(0));
      var mx = 0;
      var vals = [];
      for (var i = 0; i <= 200; i += 1) {
        var w = i / 200;
        var v = Math.exp((-SIG2 / 4) * (w - s.nu) * (w - s.nu)) + Math.exp((-SIG2 / 4) * (w + s.nu) * (w + s.nu));
        vals.push(v);
        mx = Math.max(mx, v);
      }
      vals.forEach(function (v, i2) { ctx.lineTo(F.X(i2 / 200), F.Y(v / mx)); });
      ctx.lineTo(F.X(1), F.Y(0));
      ctx.fillStyle = "rgba(255, 178, 122, 0.12)";
      ctx.fill();
      ctx.strokeStyle = COL.pulse;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      for (var n = 0; n < 3; n += 1) {
        var px = F.X(QNM[2][n][0]);
        vline(ctx, F, px, "rgba(237, 239, 243, " + (0.5 - 0.13 * n) + ")", [2, 3]);
      }
      label(ctx, "n = 0", F.X(QNM[2][0][0]) + 5, F.y0 + 6, "left", "top", COL.ink2);
      label(ctx, "n = 1, 2", F.X(QNM[2][2][0]) - 5, F.y0 + 6, "right", "top", COL.ink3);
    }

    function drawResp() {
      if (!resp.fit()) return;
      var ctx = resp.ctx;
      var F = frame(resp, [24, 14, 40, 46], [0, 0.8], [0, 1.12]);
      RF = F;
      axes(ctx, F, { xt: [0, 0.2, 0.4, 0.6, 0.8], yt: [0, 0.5, 1], fx: function (v) { return v.toFixed(1); }, fy: function (v) { return v.toFixed(1); }, xl: "frequency of the packet  ν", yl: "amplitude of the fundamental mode" });
      var pts = PN.map(function (v, i) { return [F.X(0.005 * i), F.Y(v / pmax)]; });
      line(ctx, pts, COL.acc, 1.7);
      if (scale) {
        meas.forEach(function (m, i) {
          if (m == null) return;
          dot(ctx, F.X(NU[i]), F.clampY(F.Y(m / scale / pmax)), 3.6, COL.ink, true);
        });
      }
      vline(ctx, F, F.X(s.nu));
      dot(ctx, F.X(s.nu), F.Y(predict(s.nu) / pmax), 4, COL.acc, true);
      label(ctx, "● simulation   — prediction", F.x1 - 4, F.y0 + 6, "right", "top");
    }

    function draw() {
      var pv = predict(s.nu) / pmax;
      var k = Math.round(s.nu / 0.05);
      var txt = "Packet frequency ν = " + s.nu.toFixed(3) + "\nPredicted amplitude  " + pv.toFixed(3) + "\n";
      if (meas[k] != null && scale) txt += "Simulation, ν = " + NU[k].toFixed(2) + "  " + (meas[k] / scale / pmax).toFixed(3) + "\n";
      else txt += "Simulations running…\n";
      txt += "Largest response at ν = " + pbest.toFixed(3) + "\nRe Mω of the mode   = " + W0[0].toFixed(3);
      read.textContent = txt;
      drawSpec();
      drawResp();
    }

    function start() {
      if (started) return;
      started = true;
      var i = 0;
      (function next() {
        if (i >= NU.length) return;
        measure(i);
        i += 1;
        draw();
        window.setTimeout(next, 16);
      })();
    }

    var dragging = false;
    function fromPointer(e) {
      if (!RF) return;
      var r = resp.c.getBoundingClientRect();
      var v = Math.max(0, Math.min(0.8, Math.round(RF.invX(e.clientX - r.left) / 0.005) * 0.005));
      s.nu = v;
      nuSlider.set(v);
      draw();
    }
    resp.c.style.cursor = "ew-resize";
    resp.c.addEventListener("pointerdown", function (e) { dragging = true; resp.c.setPointerCapture(e.pointerId); fromPointer(e); });
    resp.c.addEventListener("pointermove", function (e) { if (dragging) fromPointer(e); });
    resp.c.addEventListener("pointerup", function () { dragging = false; });
    redraw(draw);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { if (es[es.length - 1].isIntersecting) start(); }, { rootMargin: "200px" }).observe(fig);
    } else start();
  };

  /* ======================================================================
     Lesson 8. The tail
     ====================================================================== */

  W.tail = function (fig) {
    var u = layout(fig);
    var main = panel(u.stage, "w-h-lg", "The signal far from the black hole on logarithmic axes, showing the ringdown and then the power-law tail");
    var slp = panel(u.stage, "w-h-sm", "Local power of the decay against time, approaching the value of Price's law");
    var s = { l: 0, nu: 0, ref: true };
    var cache = {};
    seg(u.ctrl, { label: "Multipole ℓ", options: [[0, "0"], [1, "1"], [2, "2"]], value: 0, on: function (v) { s.l = v; queue(); } });
    slider(u.ctrl, { label: "Oscillation of the packet  ν", min: 0, max: 0.5, step: 0.05, value: 0, fmt: f2, on: function (v) { s.nu = v; queue(); } });
    check(u.ctrl, { label: "Smooth packet, ν = 0", value: true, swatch: "1.5px solid " + COL.ink3, on: function (v) { s.ref = v; draw(); } });
    var read = readout(u.ctrl);
    var T = 1500;

    function sim(l, nu) {
      var key = l + ":" + nu.toFixed(2);
      if (!cache[key]) {
        cache[key] = evolve({
          x0: -800,
          x1: 850,
          dx: 0.5,
          T: T,
          obs: 40,
          V: function (x) { return POT.s0(rOf(x), l); },
          init: function (x) { var z = x - 20; return Math.exp((-z * z) / 72) * Math.cos(nu * z); },
        });
      }
      return cache[key];
    }

    var pending = 0;
    function queue() {
      if (pending) return;
      pending = window.requestAnimationFrame(function () {
        pending = 0;
        draw();
      });
    }

    function at(S, t) { return S.y[Math.round(t / S.dt)]; }
    function power(S, t) { return Math.log(Math.abs(at(S, 1.05 * t) / at(S, t))) / Math.log(1.05); }

    function draw() {
      var S = sim(s.l, s.nu);
      var R = sim(s.l, 0);
      var pr = -(2 * s.l + 3);
      // for l = 2 the tail of an oscillating packet nears rounding noise late on
      var tR = s.l === 2 ? 600 : 1000;
      var tP = s.l === 2 ? 700 : 1400;
      var ratio = Math.abs(at(S, tR) / at(R, tR));
      read.textContent =
        "Price's law: |ψ| ∝ t^" + pr + "\nLocal power at t = " + tP + "M: " + power(S, tP).toFixed(2) +
        "\nTail at t = " + tR + "M, against the\nsmooth packet's: " + ratio.toFixed(3) + "\nPacket spectrum at ω = 0,\ne^(−18ν²) = " + Math.exp(-18 * s.nu * s.nu).toFixed(3);
      if (main.fit()) {
        var ctx = main.ctx;
        var F = frame(main, [24, 14, 40, 46], [1, Math.log10(T)], [-16, 0.3], true);
        axes(ctx, F, { xt: [1, 2, 3], yt: [-15, -12, -9, -6, -3, 0], fx: function (v) { return v === 1 ? "10M" : v === 2 ? "100M" : "1000M"; }, fy: function (e) { return e === 0 ? "1" : "1e" + e; }, xl: "time  (log scale)", yl: "|ψ| far from the hole" });
        ctx.save();
        clip(ctx, F);
        function curve(Sx, col, wdt) {
          ctx.beginPath();
          var st = false;
          for (var i = Math.round(10 / Sx.dt); i < Sx.y.length; i += 2) {
            var px = F.X(Math.log10(i * Sx.dt));
            var py = F.clampY(F.Y(Sx.y[i]));
            if (st) ctx.lineTo(px, py);
            else { ctx.moveTo(px, py); st = true; }
          }
          ctx.strokeStyle = col;
          ctx.lineWidth = wdt;
          ctx.lineJoin = "round";
          ctx.stroke();
        }
        if (s.ref && s.nu > 0) curve(R, COL.ink3, 1.1);
        curve(S, COL.ink, 1.3);
        var a = Math.abs(at(S, 1000));
        line(ctx, [[F.X(Math.log10(150)), F.Y(a * Math.pow(150 / 1000, pr))], [F.X(Math.log10(T)), F.Y(a * Math.pow(T / 1000, pr))]], COL.acc, 1.6, [5, 4]);
        ctx.restore();
        label(ctx, "t^" + pr, F.X(Math.log10(160)), F.clampY(F.Y(a * Math.pow(160 / 1000, pr))) - 10, "left", "bottom", COL.acc);
      }
      if (slp.fit()) {
        var c2 = slp.ctx;
        var G = frame(slp, [22, 14, 40, 46], [2, Math.log10(T)], [-12, 0]);
        axes(c2, G, { xt: [2, Math.log10(200), Math.log10(500), 3], yt: [-12, -9, -6, -3, 0], fx: function (v) { return Math.round(Math.pow(10, v)) + "M"; }, xl: "time  (log scale)", yl: "local power  d ln|ψ| / d ln t" });
        c2.save();
        clip(c2, G);
        line(c2, [[G.x0, G.Y(pr)], [G.x1, G.Y(pr)]], COL.acc, 1.4, [5, 4]);
        var pts = [];
        for (var t = 200; t * 1.05 < T; t *= 1.005) pts.push([G.X(Math.log10(t)), G.clampY(G.Y(power(S, t)))]);
        line(c2, pts, COL.ink, 1.4);
        c2.restore();
        label(c2, "Price: " + pr, G.x0 + 6, G.Y(pr) - 8, "left", "bottom", COL.acc);
      }
    }
    redraw(draw);
  };

  /* ======================================================================
     Lesson 9. A spinning black hole
     ====================================================================== */

  function kerrGeo(c) {
    var q = Math.sqrt(1 - c * c);
    var Z1 = 1 + Math.cbrt(1 - c * c) * (Math.cbrt(1 + c) + Math.cbrt(1 - c));
    var Z2 = Math.sqrt(3 * c * c + Z1 * Z1);
    var root = Math.sqrt(Math.max(0, (3 - Z1) * (3 + Z1 + 2 * Z2)));
    return {
      rp: 1 + q,
      rm: 1 - q,
      phPro: 2 * (1 + Math.cos((2 / 3) * Math.acos(-c))),
      phRet: 2 * (1 + Math.cos((2 / 3) * Math.acos(c))),
      iscoPro: 3 + Z2 - root,
      iscoRet: 3 + Z2 + root,
      OmH: c / (2 * (1 + q)),
    };
  }

  /* rotations as unit quaternions [w, x, y, z] */
  function qmul(a, b) {
    return [
      a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
    ];
  }
  function qaxis(x, y, z, ang) {
    var sn = Math.sin(ang / 2);
    return [Math.cos(ang / 2), x * sn, y * sn, z * sn];
  }
  function qnorm(q) {
    var n = Math.hypot(q[0], q[1], q[2], q[3]);
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  }
  function qslerp(a, b, t) {
    var d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (d < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
    if (d > 0.9995) return qnorm([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2]), a[3] + t * (b[3] - a[3])]);
    var th = Math.acos(d);
    var sn = Math.sin(th);
    var wa = Math.sin((1 - t) * th) / sn;
    var wb = Math.sin(t * th) / sn;
    return [wa * a[0] + wb * b[0], wa * a[1] + wb * b[1], wa * a[2] + wb * b[2], wa * a[3] + wb * b[3]];
  }
  function qmat(q) {
    var w = q[0], x = q[1], y = q[2], z = q[3];
    return [
      1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
      2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
      2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
    ];
  }

  /* A spinning black hole in three dimensions, in Boyer–Lindquist coordinates
     drawn as if they were spherical ones, in orthographic projection. Everything
     drawn lies outside the horizon, so splitting it by the sign of its depth and
     painting the far half, the horizon, then the near half hides exactly what the
     horizon hides. */
  W.kerrgeo = function (fig) {
    var u = layout(fig);
    var view = panel(u.stage, "w-h-3d", "A spinning black hole in three dimensions: horizon, ergoregion, light rings and innermost stable orbits. Drag to turn it.");
    view.c.style.cursor = "grab";
    var ACC = "140, 188, 255", PUL = "255, 178, 122", INK = "237, 239, 243";
    var TILT = { side: 0, tilt: 0.36, top: Math.PI / 2 };
    function preset(e) { return qaxis(1, 0, 0, e - Math.PI / 2); }
    var ZOOM = { far: 9.7, near: 4.4 };
    var s = { chi: 0.7, q: preset(TILT.tilt), t: 0, anim: null, fit: ZOOM.far, fitTo: ZOOM.far };
    var seen = visibility(fig);
    var NT = 18, NP = 36;
    var mesh = null, meshChi = -1;
    var off = document.createElement("canvas");
    var octx = off.getContext("2d");

    slider(u.ctrl, { label: "Spin  χ = a/M", min: 0, max: 0.998, step: 0.001, value: s.chi, fmt: f3, on: function (v) { s.chi = v; info(); if (still || !seen.on) draw(); } });
    var viewSeg = seg(u.ctrl, {
      label: "View",
      options: [["side", "Side"], ["tilt", "Tilted"], ["top", "From above"]],
      value: "tilt",
      on: function (v) {
        var q1 = preset(TILT[v]);
        if (still) { s.q = q1; draw(); } else s.anim = { q0: s.q, q1: q1, p: 0 };
      },
    });
    seg(u.ctrl, {
      label: "Zoom",
      options: [["far", "Whole"], ["near", "Close-up"]],
      value: "far",
      on: function (v) { s.fitTo = ZOOM[v]; if (still) { s.fit = s.fitTo; draw(); } },
    });
    var read = readout(u.ctrl);

    function info() {
      var g = kerrGeo(s.chi);
      read.textContent =
        "Horizon  r₊ = " + g.rp.toFixed(3) + "M\n  inner  r₋ = " + g.rm.toFixed(3) + "M\nErgoregion out to 2M at the equator\nLight ring\n  co-rotating     " + g.phPro.toFixed(3) + "M\n  counter-rotating " + g.phRet.toFixed(3) +
        "M\nInnermost stable orbit\n  co-rotating     " + g.iscoPro.toFixed(3) + "M\n  counter-rotating " + g.iscoRet.toFixed(3) + "M\nHorizon spin  MΩ_H = " + g.OmH.toFixed(4);
    }

    function buildMesh(c) {
      var pts = [];
      for (var i = 0; i <= NT; i += 1) {
        var th = (Math.PI * i) / NT;
        var ct = Math.cos(th), st = Math.sin(th);
        var r = 1 + Math.sqrt(1 - c * c * ct * ct);
        for (var j = 0; j <= NP; j += 1) {
          var ph = (TAU * j) / NP;
          pts.push([r * st * Math.cos(ph), r * st * Math.sin(ph), r * ct]);
        }
      }
      return pts;
    }

    function draw() {
      if (!view.fit()) return;
      var ctx = view.ctx;
      var w = view.w, h = view.h;
      var c = s.chi;
      var g = kerrGeo(c);
      var M = qmat(s.q);
      var sc = Math.min(w, h - 50) / 2 / s.fit;
      var cx = w / 2, cy = (h - 24) / 2 + 8;
      var tau = s.t * 6; // M per second of real time

      function project(pts) {
        var n = pts.length;
        var P = { x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), n: n };
        for (var i = 0; i < n; i += 1) {
          var p = pts[i];
          P.x[i] = cx + (M[0] * p[0] + M[1] * p[1] + M[2] * p[2]) * sc;
          P.y[i] = cy - (M[3] * p[0] + M[4] * p[1] + M[5] * p[2]) * sc;
          P.z[i] = M[6] * p[0] + M[7] * p[1] + M[8] * p[2];
        }
        return P;
      }
      // polyline split by depth: only the segments of one layer (0 far, 1 near),
      // dimmer the farther they are; dash = segments per dash (geometric dashes)
      function strokeDepth(P, idx, rgb, width, amax, layer, zr, closed, dash) {
        var n = idx ? idx.length : P.n;
        var bins = [];
        var last = [];
        var segs = closed ? n : n - 1;
        for (var i = 0; i < segs; i += 1) {
          if (dash && Math.floor(i / dash) % 2 === 1) continue;
          var a = idx ? idx[i] : i;
          var b = idx ? idx[(i + 1) % n] : (i + 1) % n;
          var zm = 0.5 * (P.z[a] + P.z[b]);
          if ((zm > 0) !== (layer === 1)) continue;
          var k = Math.round(6 * (0.3 + 0.7 * Math.max(0, Math.min(1, 0.5 + (0.5 * zm) / zr))));
          if (!bins[k]) bins[k] = new Path2D();
          if (last[k] !== a) bins[k].moveTo(P.x[a], P.y[a]);
          bins[k].lineTo(P.x[b], P.y[b]);
          last[k] = b;
        }
        ctx.save();
        ctx.lineWidth = width;
        ctx.lineJoin = "round";
        for (var q = 0; q < bins.length; q += 1) {
          if (!bins[q]) continue;
          ctx.strokeStyle = "rgba(" + rgb + ", " + ((amax * q) / 6).toFixed(3) + ")";
          ctx.stroke(bins[q]);
        }
        ctx.restore();
      }
      function circle(r, z0, n, ph0, ph1) {
        var pts = [];
        for (var i = 0; i < n; i += 1) {
          var ph = ph0 == null ? (TAU * i) / n : ph0 + ((ph1 - ph0) * i) / (n - 1);
          pts.push([r * Math.cos(ph), r * Math.sin(ph), z0]);
        }
        return pts;
      }

      // the ergosurface, filled through an offscreen canvas so that overlaps do not darken
      if (meshChi !== c) { mesh = buildMesh(c); meshChi = c; }
      var E = project(mesh);
      var ergA = Math.min(1, c / 0.2);
      var dpr = view.c.width / w;
      if (off.width !== view.c.width || off.height !== view.c.height) { off.width = view.c.width; off.height = view.c.height; }
      function ergoFill(layer, alpha) {
        if (ergA <= 0) return;
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.clearRect(0, 0, off.width, off.height);
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        octx.fillStyle = "rgb(" + ACC + ")";
        octx.strokeStyle = "rgb(" + ACC + ")";
        octx.lineWidth = 0.6;
        for (var i = 0; i < NT; i += 1) {
          for (var j = 0; j < NP; j += 1) {
            var a = i * (NP + 1) + j, b = a + 1, d = a + NP + 1, e = d + 1;
            var zc = E.z[a] + E.z[b] + E.z[d] + E.z[e];
            if ((zc > 0) !== (layer === 1)) continue;
            octx.beginPath();
            octx.moveTo(E.x[a], E.y[a]);
            octx.lineTo(E.x[b], E.y[b]);
            octx.lineTo(E.x[e], E.y[e]);
            octx.lineTo(E.x[d], E.y[d]);
            octx.closePath();
            octx.fill();
            octx.stroke();
          }
        }
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = alpha * ergA;
        ctx.drawImage(off, 0, 0);
        ctx.restore();
      }
      function ergoWire(layer) {
        if (ergA <= 0) return;
        var idx, i, j;
        for (i = 3; i < NT; i += 3) {
          idx = [];
          for (j = 0; j <= NP; j += 1) idx.push(i * (NP + 1) + j);
          strokeDepth(E, idx, ACC, 1, 0.38 * ergA, layer, 2, false);
        }
        for (j = 0; j < NP; j += 3) {
          idx = [];
          for (i = 0; i <= NT; i += 1) idx.push(i * (NP + 1) + j);
          strokeDepth(E, idx, ACC, 1, 0.38 * ergA, layer, 2, false);
        }
      }

      // equatorial plane: a faint annulus from the horizon out to 10M
      var A = Math.hypot(M[6], M[7]);
      var phc = Math.atan2(M[7], M[6]);
      function planeFill(layer) {
        var ph0, ph1;
        if (A < 1e-4) { if (layer === 1) return; ph0 = 0; ph1 = TAU; } else if (layer === 1) { ph0 = phc - Math.PI / 2; ph1 = phc + Math.PI / 2; } else { ph0 = phc + Math.PI / 2; ph1 = phc + 1.5 * Math.PI; }
        var outer = project(circle(9.6, 0, 64, ph0, ph1));
        var inner = project(circle(g.rp, 0, 32, ph1, ph0));
        ctx.beginPath();
        for (var i = 0; i < outer.n; i += 1) ctx.lineTo(outer.x[i], outer.y[i]);
        for (i = 0; i < inner.n; i += 1) ctx.lineTo(inner.x[i], inner.y[i]);
        ctx.closePath();
        ctx.fillStyle = "rgba(" + INK + ", 0.035)";
        ctx.fill();
      }
      var rim = project(circle(9.6, 0, 160));

      // orbits on the equator, each with a particle moving at its angular velocity
      var orbits = [
        { r: g.phPro, rgb: ACC, col: COL.acc, om: 1 / (Math.pow(g.phPro, 1.5) + c), ph: 0 },
        { r: g.phRet, rgb: ACC, col: COL.acc, om: -1 / (Math.pow(g.phRet, 1.5) - c), ph: Math.PI, dash: 3 },
        { r: g.iscoPro, rgb: PUL, col: COL.pulse, om: 1 / (Math.pow(g.iscoPro, 1.5) + c), ph: Math.PI / 2 },
        { r: g.iscoRet, rgb: PUL, col: COL.pulse, om: -1 / (Math.pow(g.iscoRet, 1.5) - c), ph: 1.5 * Math.PI, dash: 3 },
      ];
      orbits.forEach(function (o) {
        o.P = project(circle(o.r, 0, 180));
        var ph = o.ph + o.om * tau;
        o.D = project([[o.r * Math.cos(ph), o.r * Math.sin(ph), 0]]);
      });
      function drawOrbits(layer) {
        orbits.forEach(function (o) { strokeDepth(o.P, null, o.rgb, 1.6, 1, layer, o.r, true, o.dash); });
        orbits.forEach(function (o) {
          var z = o.D.z[0];
          if ((z > 0) !== (layer === 1)) return;
          dot(ctx, o.D.x[0], o.D.y[0], 3.2 + 0.9 * (z / o.r), o.col, true);
        });
      }

      // spin axis with an arrow, and a curl showing the sense of rotation
      var axTop = Math.min(5.6, 0.86 * s.fit);
      var axUp = project([[0, 0, g.rp], [0, 0, axTop]]);
      var axDn = project([[0, 0, -g.rp], [0, 0, -axTop]]);
      var curl = project(circle(0.85, axTop - 0.9, 40, 0.5, TAU - 0.35));
      function drawAxis(layer) {
        [axUp, axDn].forEach(function (P) {
          if ((P.z[1] > 0) !== (layer === 1)) return;
          ctx.save();
          ctx.strokeStyle = "rgba(" + INK + ", " + (layer ? 0.45 : 0.22) + ")";
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(P.x[0], P.y[0]);
          ctx.lineTo(P.x[1], P.y[1]);
          ctx.stroke();
          ctx.restore();
        });
        strokeDepth(curl, null, INK, 1.3, 0.75, layer, 4.8, false);
        var n = curl.n - 1;
        if ((curl.z[n] > 0) === (layer === 1)) {
          var dx = curl.x[n] - curl.x[n - 2], dy = curl.y[n] - curl.y[n - 2];
          var L = Math.hypot(dx, dy);
          if (L > 0.5) {
            dx /= L; dy /= L;
            ctx.save();
            ctx.fillStyle = "rgba(" + INK + ", 0.75)";
            ctx.beginPath();
            ctx.moveTo(curl.x[n] + dx * 5, curl.y[n] + dy * 5);
            ctx.lineTo(curl.x[n] - dy * 3.5 - dx * 2, curl.y[n] + dx * 3.5 - dy * 2);
            ctx.lineTo(curl.x[n] + dy * 3.5 - dx * 2, curl.y[n] - dx * 3.5 - dy * 2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
      }

      // ---- far half ----
      planeFill(0);
      strokeDepth(rim, null, INK, 1, 0.16, 0, 10, true);
      ergoFill(0, 0.1);
      ergoWire(0);
      drawOrbits(0);
      drawAxis(0);

      // ---- the horizon ----
      var R = g.rp * sc;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      var grd = ctx.createRadialGradient(cx - 0.35 * R, cy - 0.35 * R, 0.1 * R, cx, cy, R);
      grd.addColorStop(0, "#14171e");
      grd.addColorStop(1, "#000");
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.strokeStyle = "rgba(" + INK + ", 0.32)";
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();
      // the horizon turns with angular velocity Omega_H: meridians on its near side
      var rot = g.OmH * tau;
      for (var k = 0; k < 8; k += 1) {
        var phk = rot + (k * Math.PI) / 4;
        var mer = [];
        for (var i = 0; i <= 36; i += 1) {
          var th = (Math.PI * i) / 36;
          mer.push([g.rp * Math.sin(th) * Math.cos(phk), g.rp * Math.sin(th) * Math.sin(phk), g.rp * Math.cos(th)]);
        }
        strokeDepth(project(mer), null, INK, 1, 0.2, 1, g.rp, false);
      }
      strokeDepth(project(circle(g.rp, 0, 72)), null, INK, 1, 0.2, 1, g.rp, true);
      if (g.rm > 0.03) {
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = "rgba(" + INK + ", 0.3)";
        ctx.beginPath();
        ctx.arc(cx, cy, g.rm * sc, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      // ---- near half ----
      planeFill(1);
      strokeDepth(rim, null, INK, 1, 0.16, 1, 10, true);
      ergoFill(1, 0.1);
      ergoWire(1);
      drawOrbits(1);
      drawAxis(1);

      // ---- labels ----
      tag(ctx, "spin", axUp.x[1] + 8, axUp.y[1], "left", COL.ink2);
      legend(ctx, { x0: 0, y0: 0, x1: w }, [
        { name: "light rings", c: COL.acc },
        { name: "ISCOs", c: COL.pulse },
        { name: "ergoregion", c: "rgba(" + ACC + ", 0.55)" },
      ]);
      label(ctx, "solid: with the spin · dashed: against it", 8, h - 8, "left", "bottom");
      if (w >= 560) label(ctx, "drag to turn", w - 8, h - 8, "right", "bottom");
    }

    var drag = null;
    view.c.addEventListener("pointerdown", function (e) {
      drag = { x: e.clientX, y: e.clientY };
      s.anim = null;
      view.c.setPointerCapture(e.pointerId);
      view.c.style.cursor = "grabbing";
    });
    view.c.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var k = 0.009;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      s.q = qnorm(qmul(qmul(qaxis(0, 1, 0, dx * k), qaxis(1, 0, 0, dy * k)), s.q));
      viewSeg.set(null);
      if (still) draw();
    });
    function release() { drag = null; view.c.style.cursor = "grab"; }
    view.c.addEventListener("pointerup", release);
    view.c.addEventListener("pointercancel", release);

    loop(seen, function (dt) {
      s.t += dt;
      s.fit += (s.fitTo - s.fit) * Math.min(1, dt * 7);
      if (s.anim) {
        s.anim.p = Math.min(1, s.anim.p + dt / 0.7);
        var e = s.anim.p * s.anim.p * (3 - 2 * s.anim.p);
        s.q = qslerp(s.anim.q0, s.anim.q1, e);
        if (s.anim.p >= 1) s.anim = null;
      }
      draw();
    });
    info();
    redraw(draw);
  };

  var KMODES = [
    { k: "220", m: 2, name: "m = 2", c: COL.pos },
    { k: "210", m: 1, name: "m = 1", c: COL.pulse },
    { k: "200", m: 0, name: "m = 0", c: COL.ink },
    { k: "2-10", m: -1, name: "m = −1", c: COL.acc },
    { k: "2-20", m: -2, name: "m = −2", c: COL.neg },
  ];

  W.kerrqnm = function (fig) {
    var u = layout(fig);
    var plane = panel(u.stage, "w-h-lg", "Quasinormal frequencies of a spinning black hole in the complex plane, for growing spin");
    var qp = panel(u.stage, "w-h-sm", "Quality factor of the modes against the spin");
    var CH = KERR["220"].map(function (r) { return r[0]; });
    var s = { i: CH.indexOf(0.7), over: false, hq: null };
    var sl = slider(u.ctrl, { label: "Spin  χ", min: 0, max: CH.length - 1, step: 1, value: s.i, fmt: function (v) { return CH[v].toFixed(2); }, on: function (v) { s.i = v; draw(); } });
    check(u.ctrl, { label: "ℓ = m = 2, first overtone", value: false, swatch: "1.5px dashed " + COL.ink3, on: function (v) { s.over = v; draw(); } });
    var read = readout(u.ctrl);
    var QF = null;

    function Q(row) { return row[1] / (2 * -row[2]); }

    function draw() {
      var chi = CH[s.i];
      var txt = "χ = " + chi.toFixed(2) + "   ℓ = 2, n = 0\n";
      KMODES.forEach(function (m) {
        var r = KERR[m.k][s.i];
        txt += "  " + (m.name + "     ").slice(0, 7) + cplx(r[1], r[2], 4) + "  Q = " + Q(r).toFixed(2) + "\n";
      });
      if (s.over) { var o = KERR["221"][s.i]; txt += "Overtone n = 1, m = 2\n  " + cplx(o[1], o[2], 4); }
      read.textContent = txt.replace(/\n$/, "");
      if (plane.fit()) {
        var ctx = plane.ctx;
        var F = frame(plane, [24, 14, 40, 52], [0.25, 0.92], s.over ? [-0.3, 0] : [-0.097, -0.024]);
        axes(ctx, F, { xt: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], yt: s.over ? [-0.3, -0.2, -0.1, 0] : [-0.09, -0.07, -0.05, -0.03], fx: function (v) { return v.toFixed(1); }, fy: function (v) { return v.toFixed(s.over ? 1 : 2); }, xl: "Re Mω", yl: "Im Mω" });
        ctx.save();
        clip(ctx, F);
        var list = KMODES.slice();
        if (s.over) list.push({ k: "221", name: "n = 1", c: COL.ink3, dash: [5, 4] });
        list.forEach(function (m) {
          line(ctx, KERR[m.k].map(function (r) { return [F.X(r[1]), F.Y(r[2])]; }), m.c, 1.5, m.dash);
        });
        list.forEach(function (m) {
          var r = KERR[m.k][s.i];
          dot(ctx, F.X(r[1]), F.Y(r[2]), 4, m.c, true);
        });
        ctx.restore();
        [["220", -8, "right"], ["210", 8, "left"], ["221", 8, "left"]].forEach(function (q) {
          if (q[0] === "221" && !s.over) return;
          var e = KERR[q[0]][KERR[q[0]].length - 1];
          var m = list.filter(function (x) { return x.k === q[0]; })[0];
          tag(ctx, m.name, F.X(e[1]) + q[1], F.Y(e[2]), q[2], m.c);
        });
        var z = KERR["220"][0];
        tag(ctx, "χ = 0", F.X(z[1]) + 4, F.Y(z[2]) + 15, "center");
        legend(ctx, F, list);
      }
      if (qp.fit()) {
        var c2 = qp.ctx;
        var G = frame(qp, [22, 14, 40, 52], [0, 1], [0, 16]);
        QF = G;
        axes(c2, G, { xt: [0, 0.2, 0.4, 0.6, 0.8, 1], yt: [0, 5, 10, 15], fx: function (v) { return v.toFixed(1); }, xl: "spin χ", yl: "quality factor Q = Re ω / 2|Im ω|" });
        KMODES.forEach(function (m) {
          line(c2, KERR[m.k].map(function (r) { return [G.X(r[0]), G.Y(Q(r))]; }), m.c, 1.5);
        });
        vline(c2, G, G.X(chi));
        KMODES.forEach(function (m) { dot(c2, G.X(chi), G.Y(Q(KERR[m.k][s.i])), 3.2, m.c, true); });
        line(c2, [[G.x0, G.Y(2.1)], [G.x1, G.Y(2.1)]], "rgba(237, 239, 243, 0.25)", 1, [2, 4]);
      }
    }

    function fromPointer(e) {
      if (!QF) return;
      var r = qp.c.getBoundingClientRect();
      var x = QF.invX(e.clientX - r.left);
      var best = 0;
      CH.forEach(function (cv, k) { if (Math.abs(cv - x) < Math.abs(CH[best] - x)) best = k; });
      if (best !== s.i) { s.i = best; sl.set(best); draw(); }
    }
    var dragging = false;
    qp.c.style.cursor = "ew-resize";
    qp.c.addEventListener("pointerdown", function (e) { dragging = true; qp.c.setPointerCapture(e.pointerId); fromPointer(e); });
    qp.c.addEventListener("pointermove", function (e) { if (dragging) fromPointer(e); });
    qp.c.addEventListener("pointerup", function () { dragging = false; });
    redraw(draw);
  };

  /* ======================================================================
     Lesson 10. A charge falls in
     ====================================================================== */

  var S0LOW = { 1: [0.292936, -0.09766], 2: FUND.s0[2], 3: FUND.s0[3] };

  // A point scalar charge falling from rest at infinity: dr*/dt = -sqrt(2M/r).
  // Source (constant factors dropped): f(r_p) / r_p times a narrow Gaussian in r* at the
  // charge (u^t = 1/f for a fall from rest), switched on smoothly at the start.
  function infallRun(l) {
    var dx = 0.2, dt = 0.1, X0 = -300, OBS = 250, X1 = 700, XS = 90, SIG = 0.6, RAMP = 50, T = 950;
    var N = Math.round((X1 - X0) / dx) + 1;
    var V = new Float64Array(N), a = new Float64Array(N), b = new Float64Array(N), c = new Float64Array(N);
    for (var i = 0; i < N; i += 1) V[i] = POT.s0(rOf(X0 + i * dx), l) * dt * dt;
    var io = Math.round((OBS - X0) / dx);
    var steps = Math.round(T / dt);
    var y = new Float64Array(steps + 1);
    var xp = new Float64Array(steps + 1);
    var x = XS;
    xp[0] = x;
    var norm = 1 / (Math.sqrt(TAU) * SIG);
    function vel(z) { return -Math.sqrt(2 / rOf(z)); }
    for (var n = 1; n <= steps; n += 1) {
      for (var m = 1; m < N - 1; m += 1) c[m] = 2 * b[m] - a[m] + 0.25 * (b[m + 1] - 2 * b[m] + b[m - 1]) - V[m] * b[m];
      if (x > X0 + 40) {
        var t = (n - 1) * dt;
        var w = Math.min(1, t / RAMP);
        w = w * w * (3 - 2 * w);
        var rp = rOf(x);
        var fp = 1 - 2 / rp;
        var amp = (w * fp * norm * dt * dt) / rp;
        var j0 = Math.max(1, Math.floor((x - 5 * SIG - X0) / dx));
        var j1 = Math.min(N - 2, Math.ceil((x + 5 * SIG - X0) / dx));
        for (var j = j0; j <= j1; j += 1) {
          var d = X0 + j * dx - x;
          c[j] += amp * Math.exp((-d * d) / (2 * SIG * SIG));
        }
        var k1 = vel(x), k2 = vel(x + 0.5 * dt * k1), k3 = vel(x + 0.5 * dt * k2), k4 = vel(x + dt * k3);
        x += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      }
      c[0] = b[0] + 0.5 * (b[1] - b[0]);
      c[N - 1] = b[N - 1] - 0.5 * (b[N - 1] - b[N - 2]);
      var tmp = a;
      a = b;
      b = c;
      c = tmp;
      y[n] = b[io];
      xp[n] = x;
    }
    return { y: y, xp: xp, dt: dt, obs: OBS };
  }

  W.infall = function (fig) {
    var u = layout(fig);
    var top = panel(u.stage, "w-h-sm", "A scalar charge falling into the black hole, drawn over the potential barrier");
    var sig = panel(u.stage, "w-h-md", "The wave emitted by the falling charge, recorded far away");
    var spec = panel(u.stage, "w-h-sm", "Energy spectrum of the emitted wave, with the frequency of the fundamental quasinormal mode");
    var s = { l: 2, te: 0 };
    var seen = visibility(fig);
    var cache = {};
    var R = null;
    var U0 = 170, U1 = 620;
    seg(u.ctrl, { label: "Multipole ℓ", options: [[1, "1"], [2, "2"], [3, "3"]], value: 2, on: function (v) { s.l = v; load(); } });
    var read = readout(u.ctrl);

    function load() {
      if (!cache[s.l]) {
        var S = infallRun(s.l);
        // retarded time of the direct emission: u = t - x_p(t)
        var n = S.y.length;
        S.u = new Float64Array(n);
        for (var i = 0; i < n; i += 1) S.u[i] = i * S.dt - S.xp[i];
        // energy spectrum of psi_t over the window, with soft edges
        var i0 = Math.round((U0 + S.obs) / S.dt);
        var i1 = Math.round((U1 + S.obs) / S.dt);
        S.spec = [];
        var best = 0, bw = 0;
        for (var k = 1; k <= 200; k += 1) {
          var w = k / 200;
          var re = 0, im = 0;
          for (var q = i0 + 1; q < i1; q += 2) {
            var f = (q - i0) / (i1 - i0);
            var tap = f < 0.1 ? 0.5 - 0.5 * Math.cos((Math.PI * f) / 0.1) : f > 0.9 ? 0.5 - 0.5 * Math.cos((Math.PI * (1 - f)) / 0.1) : 1;
            var d = (S.y[q + 1] - S.y[q - 1]) / (2 * S.dt);
            var t = q * S.dt;
            re += tap * d * Math.cos(w * t);
            im += tap * d * Math.sin(w * t);
          }
          var p = re * re + im * im;
          S.spec.push(p);
          if (p > best) { best = p; bw = w; }
        }
        S.best = bw;
        S.smax = best;
        var pk = peak("s0", s.l);
        S.pk = pk;
        S.cross = 0;
        for (var z = 0; z < n; z += 1) if (S.xp[z] < pk.rs) { S.cross = z * S.dt - pk.rs; break; }
        cache[s.l] = S;
      }
      R = cache[s.l];
      s.te = 0;
      read.textContent =
        "The charge crosses the top of the barrier\n  at retarded time u ≈ " + R.cross.toFixed(0) + "M\nSpectrum of the emitted energy\n  peaks at Mω = " + R.best.toFixed(3) + "\nFundamental mode of this ℓ\n  Re Mω = " + S0LOW[s.l][0].toFixed(3);
      draw();
    }

    function teFor(uu) {
      for (var i = 0; i < R.u.length; i += 1) if (R.u[i] >= uu) return i * R.dt;
      return R.u.length * R.dt;
    }

    function draw() {
      if (!R) return;
      var ti = Math.min(R.xp.length - 1, Math.round(s.te / R.dt));
      var uNow = R.u[ti];
      if (top.fit()) {
        var ctx = top.ctx;
        var F = frame(top, [16, 14, 28, 14], [-30, 100], [0, 1.2]);
        var V0 = R.pk.V0;
        var pts = [];
        for (var i = 0; i <= 260; i += 1) {
          var x = -30 + (130 * i) / 260;
          pts.push([F.X(x), F.Y(POT.s0(rOf(x), s.l) / V0)]);
        }
        line(ctx, [[F.x0, F.Y(0)], [F.x1, F.Y(0)]], COL.axis, 1);
        line(ctx, pts, "rgba(140, 188, 255, 0.7)", 1.4);
        var xc = R.xp[ti];
        if (xc > -30) {
          dot(ctx, F.X(xc), F.Y(POT.s0(rOf(xc), s.l) / V0) - 6, 4.5, COL.pulse, true);
        }
        label(ctx, "← to the horizon", F.x0, F.y1 + 8, "left", "top");
        if (top.w >= 560) label(ctx, "r*", F.X(0), F.y1 + 8, "center", "top");
        label(ctx, "the charge falls from far away →", F.x1, F.y1 + 8, "right", "top");
      }
      if (sig.fit()) {
        var c2 = sig.ctx;
        var amp = 0;
        var j0 = Math.round((U0 + R.obs) / R.dt);
        var j1 = Math.round((U1 + R.obs) / R.dt);
        for (var j = j0; j <= j1; j += 1) amp = Math.max(amp, Math.abs(R.y[j]));
        var G = frame(sig, [22, 14, 40, 18], [U0, U1], [-1.15 * amp, 1.15 * amp]);
        axes(c2, G, { xt: nice(U0, U1, sig.w < 520 ? 4 : 8).t, zeroY: 0, xl: "retarded time  t − r*  (M)", yl: "ψ far from the hole" });
        vline(c2, G, G.X(R.cross), "rgba(140, 188, 255, 0.45)", [2, 4]);
        if (sig.w >= 560) label(c2, "charge crosses the barrier", G.X(R.cross) - 6, G.y0 + 8, "right", "top", COL.acc);
        else label(c2, "crosses the barrier", G.X(R.cross) + 6, G.y0 + 8, "left", "top", COL.acc);
        c2.save();
        clip(c2, G);
        var pp = [];
        for (var q = j0; q <= j1; q += 2) pp.push([G.X(q * R.dt - R.obs), G.Y(R.y[q])]);
        line(c2, pp, COL.ink, 1.3);
        c2.restore();
        if (!still && uNow > U0 && uNow < U1) vline(c2, G, G.X(uNow), "rgba(255, 178, 122, 0.6)");
      }
      if (spec.fit()) {
        var c3 = spec.ctx;
        var H = frame(spec, [22, 14, 40, 18], [0, 1], [0, 1.15]);
        axes(c3, H, { xt: [0, 0.2, 0.4, 0.6, 0.8, 1], fx: function (v) { return v.toFixed(1); }, xl: "Mω", yl: "energy emitted per unit frequency" });
        var sp = R.spec.map(function (p, k) { return [H.X((k + 1) / 200), H.Y(p / R.smax)]; });
        sp.unshift([H.X(0), H.Y(0)]);
        line(c3, sp, COL.ink, 1.5);
        var wq = S0LOW[s.l][0];
        vline(c3, H, H.X(wq), "rgba(140, 188, 255, 0.7)", [4, 3]);
        label(c3, "Re Mω of the mode", H.X(wq) + 6, H.y0 + 6, "left", "top", COL.acc);
      }
    }

    loop(seen, function (dt) {
      if (!R) return;
      if (s.te === 0) s.te = teFor(U0);
      s.te += dt * 32;
      if (R.u[Math.min(R.u.length - 1, Math.round(s.te / R.dt))] > U1 || s.te > 940) s.te = teFor(U0);
      draw();
    });
    load();
    window.addEventListener("resize", draw);
    if (document.fonts) document.fonts.ready.then(draw);
  };

  /* least squares with a few fixed complex frequencies:
     psi = sum_n e^{wi_n t}(A_n cos wr_n t + B_n sin wr_n t), t from the window start */
  function modefit(y, i0, i1, dt, ws) {
    var K = 2 * ws.length;
    var M = [];
    var r = [];
    for (var a = 0; a < K; a += 1) { M.push(new Float64Array(K)); r.push(0); }
    var col = new Float64Array(K);
    for (var i = i0; i <= i1; i += 1) {
      var t = (i - i0) * dt;
      for (var n = 0; n < ws.length; n += 1) {
        var e = Math.exp(ws[n][1] * t);
        col[2 * n] = e * Math.cos(ws[n][0] * t);
        col[2 * n + 1] = e * Math.sin(ws[n][0] * t);
      }
      for (var p = 0; p < K; p += 1) {
        r[p] += col[p] * y[i];
        for (var q = 0; q < K; q += 1) M[p][q] += col[p] * col[q];
      }
    }
    // Gaussian elimination with partial pivoting
    for (var c = 0; c < K; c += 1) {
      var piv = c;
      for (var k = c + 1; k < K; k += 1) if (Math.abs(M[k][c]) > Math.abs(M[piv][c])) piv = k;
      var tm = M[c]; M[c] = M[piv]; M[piv] = tm;
      var tr = r[c]; r[c] = r[piv]; r[piv] = tr;
      for (k = c + 1; k < K; k += 1) {
        var f = M[k][c] / M[c][c];
        for (var j = c; j < K; j += 1) M[k][j] -= f * M[c][j];
        r[k] -= f * r[c];
      }
    }
    var x = new Float64Array(K);
    for (c = K - 1; c >= 0; c -= 1) {
      var sum = r[c];
      for (j = c + 1; j < K; j += 1) sum -= M[c][j] * x[j];
      x[c] = sum / M[c][c];
    }
    return x;
  }

  W.overtones = function (fig) {
    var u = layout(fig);
    var main = panel(u.stage, "w-h-md", "Amplitude of the fundamental mode, fitted with one to four modes, against the time at which the fit starts");
    var sigp = panel(u.stage, "w-h-md", "The signal and the fitted sum of modes");
    var s = { N: 3, u0: 6 };
    var NC = [COL.ink3, COL.acc, COL.pulse, COL.ink];
    var U = [-10, 80];
    var END = 140;
    var sim = evolve({
      x0: -300, x1: 600, dx: 0.2, T: 430, obs: 100,
      V: function (x) { return POT.rw(rOf(x), 2); },
      init: function (x) { var z = x - 50; return Math.exp((-z * z) / 72) * Math.cos(0.4 * z); },
    });
    var amps = {};
    var ref = 0;
    function fitAt(N, u0) {
      var i0 = sim.ip + Math.round(u0 / sim.dt);
      var i1 = sim.ip + Math.round(END / sim.dt);
      var ws = QNM[2].slice(0, N);
      var x = modefit(sim.y, i0, i1, sim.dt, ws);
      return { x: x, ws: ws, i0: i0 };
    }
    for (var N = 1; N <= 4; N += 1) {
      amps[N] = [];
      for (var v = U[0]; v <= U[1]; v += 1) {
        var f = fitAt(N, v);
        amps[N].push(Math.hypot(f.x[0], f.x[1]) * Math.exp(-QNM[2][0][1] * v));
      }
    }
    ref = amps[1][60 - U[0]];

    seg(u.ctrl, { label: "Modes in the fit", options: [[1, "1"], [2, "2"], [3, "3"], [4, "4"]], value: s.N, on: function (v) { s.N = v; draw(); } });
    var sl = slider(u.ctrl, { label: "Fit starts after the peak", min: U[0], max: U[1], step: 1, value: s.u0, fmt: function (v) { return (v < 0 ? "−" : "+") + Math.abs(v) + "M"; }, on: function (v) { s.u0 = v; draw(); } });
    var read = readout(u.ctrl);
    var MF = null;

    function draw() {
      var f = fitAt(s.N, s.u0);
      var txt = "Fit with " + s.N + " mode" + (s.N > 1 ? "s" : "") + " from +" + s.u0 + "M\nAmplitudes at the peak, against n = 0\n";
      var a0 = Math.hypot(f.x[0], f.x[1]) * Math.exp(-QNM[2][0][1] * s.u0);
      for (var n = 0; n < s.N; n += 1) {
        var an = Math.hypot(f.x[2 * n], f.x[2 * n + 1]) * Math.exp(-QNM[2][n][1] * s.u0);
        var rr = an / a0;
        txt += "  n = " + n + "   " + (rr < 100 ? rr.toFixed(2) : "> 100, meaningless") + "\n";
      }
      txt += "n = 0 against its late value: " + (a0 / ref).toFixed(3);
      read.textContent = txt;
      if (main.fit()) {
        var ctx = main.ctx;
        var F = frame(main, [24, 14, 40, 46], U, [0.6, 1.4]);
        MF = F;
        axes(ctx, F, { xt: [0, 20, 40, 60, 80], yt: [0.6, 0.8, 1, 1.2, 1.4], fy: function (v) { return v.toFixed(1); }, xl: "fit start, after the peak  (M)", yl: "amplitude of n = 0, against its late value" });
        ctx.save();
        clip(ctx, F);
        for (var N2 = 1; N2 <= 4; N2 += 1) {
          line(ctx, amps[N2].map(function (a, k) { return [F.X(U[0] + k), F.clampY(F.Y(a / ref))]; }), NC[N2 - 1], N2 === s.N ? 2 : 1.2);
        }
        ctx.restore();
        vline(ctx, F, F.X(s.u0));
        dot(ctx, F.X(s.u0), F.clampY(F.Y(amps[s.N][s.u0 - U[0]] / ref)), 4, NC[s.N - 1], true);
        for (var N3 = 1; N3 <= 4; N3 += 1) label(ctx, N3 + (N3 > 1 ? " modes" : " mode"), F.x1 - 4, F.y0 + 6 + 13 * (N3 - 1), "right", "top", NC[N3 - 1]);
      }
      if (sigp.fit()) {
        var c2 = sigp.ctx;
        var G = frame(sigp, [22, 14, 40, 46], [-10, 150], [-9, 0.3], true);
        axes(c2, G, { xt: [0, 50, 100, 150], yt: [-8, -6, -4, -2, 0], fy: function (e) { return e === 0 ? "1" : "1e" + e; }, xl: "time after the peak  (M)", yl: "|ψ|, signal and fit" });
        c2.fillStyle = "rgba(140, 188, 255, 0.07)";
        c2.fillRect(G.X(s.u0), G.y0, G.X(END) - G.X(s.u0), G.y1 - G.y0);
        c2.save();
        clip(c2, G);
        var pts = [];
        for (var i = sim.ip - Math.round(10 / sim.dt); i <= sim.ip + Math.round(150 / sim.dt); i += 2) pts.push([G.X(i * sim.dt - sim.tp), G.clampY(G.Y(sim.y[i]))]);
        line(c2, pts, COL.ink, 1.3);
        var fp = [];
        for (var t = 0; s.u0 + t <= 150; t += 0.25) {
          var val = 0;
          for (var k = 0; k < f.ws.length; k += 1) {
            var e = Math.exp(f.ws[k][1] * t);
            val += e * (f.x[2 * k] * Math.cos(f.ws[k][0] * t) + f.x[2 * k + 1] * Math.sin(f.ws[k][0] * t));
          }
          fp.push([G.X(s.u0 + t), G.clampY(G.Y(val))]);
        }
        line(c2, fp, NC[s.N - 1], 1.6, [5, 4]);
        c2.restore();
      }
    }
    var dragging = false;
    function fromPointer(e) {
      if (!MF) return;
      var r = main.c.getBoundingClientRect();
      var v = Math.max(U[0], Math.min(U[1], Math.round(MF.invX(e.clientX - r.left))));
      if (v !== s.u0) { s.u0 = v; sl.set(v); draw(); }
    }
    main.c.style.cursor = "ew-resize";
    main.c.addEventListener("pointerdown", function (e) { dragging = true; main.c.setPointerCapture(e.pointerId); fromPointer(e); });
    main.c.addEventListener("pointermove", function (e) { if (dragging) fromPointer(e); });
    main.c.addEventListener("pointerup", function () { dragging = false; });
    redraw(draw);
  };

  /* ======================================================================
     Lesson 11. Echoes
     ====================================================================== */

  // r - 2M from r*, without losing digits near the horizon
  function rMinus2(rs) {
    var y = rs / 2 - 1;
    var u = y < -1 ? y : y - 0.6;
    for (var k = 0; k < 60; k += 1) { var eu = Math.exp(u); var du = (eu + u - y) / (eu + 1); u -= du; if (Math.abs(du) < 1e-14) break; }
    return 2 * Math.exp(u);
  }

  W.echoes = function (fig) {
    var u = layout(fig);
    var view = panel(u.stage, "w-h-lg", "Signal of an object with a reflecting surface just outside where the horizon would be: the ringdown, then echoes");
    var s = { wall: -60, R: 0.8, log: false };
    var cache = {};
    var pkrs = peak("rw", 2).rs;
    function run(wall, R) {
      if (R === 0 && bh) return bh;
      var key = wall + ":" + R;
      if (!cache[key]) {
        cache[key] = evolve({
          x0: wall, x1: 600, dx: 0.2, T: 950, obs: 100, rho: -R,
          V: function (x) { return POT.rw(rOf(x), 2); },
          init: function (x) { var z = x - 50; return Math.exp((-z * z) / 72) * Math.cos(0.4 * z); },
        });
      }
      return cache[key];
    }
    // reference black hole: the left end far enough away that nothing comes back within T
    var bh = null;
    bh = run(-450, 0);
    seg(u.ctrl, { label: "Vertical scale", options: [[false, "ψ"], [true, "log |ψ|"]], value: false, on: function (v) { s.log = v; draw(); } });
    slider(u.ctrl, { label: "Surface at  r*", min: -150, max: -20, step: 5, value: s.wall, fmt: function (v) { return "−" + Math.abs(v) + "M"; }, on: function (v) { s.wall = v; queue(); } });
    slider(u.ctrl, { label: "Reflectivity", min: 0, max: 1, step: 0.05, value: s.R, fmt: f2, on: function (v) { s.R = v; queue(); } });
    var read = readout(u.ctrl);

    var pending = 0;
    function queue() {
      if (pending) return;
      pending = window.requestAnimationFrame(function () { pending = 0; draw(); });
    }

    function draw() {
      var S = run(s.wall, s.R);
      var gap = 2 * (pkrs - s.wall);
      var lo = bh.ip + Math.round((0.5 * gap) / S.dt);
      var hi = Math.min(S.y.length - 1, bh.ip + Math.round((1.5 * gap) / S.dt));
      var im = lo;
      for (var i = lo; i <= hi; i += 1) if (Math.abs(S.y[i]) > Math.abs(S.y[im])) im = i;
      var first = (im - bh.ip) * S.dt;
      var ratio = Math.abs(S.y[im]) / Math.abs(bh.y[bh.ip]);
      read.textContent =
        "Surface at r* = " + s.wall + "M,\n  r − 2M = " + rMinus2(s.wall).toExponential(1) + " M\nRound trip, 2(r*_peak − r*_surface)\n  = " + gap.toFixed(0) + "M\n" +
        (s.R > 0 && ratio > 1e-4 ? "First echo, measured\n  " + first.toFixed(0) + "M after the main peak\n  " + (100 * ratio).toFixed(1) + " % of its height" : "No echo: the surface absorbs.");
      if (!view.fit()) return;
      var ctx = view.ctx;
      var VIEW = [-20, 780];
      var F;
      if (s.log) {
        F = frame(view, [24, 14, 40, 46], VIEW, [-10, 0.3], true);
        axes(ctx, F, { xt: nice(0, 750, view.w < 520 ? 3 : 6).t, yt: [-10, -8, -6, -4, -2, 0], fy: function (e) { return e === 0 ? "1" : "1e" + e; }, xl: "time after the main peak  (M)", yl: "|ψ| far away" });
      } else {
        var amp = Math.abs(bh.y[bh.ip]);
        F = frame(view, [24, 14, 40, 46], VIEW, [-1.1 * amp, 1.1 * amp]);
        axes(ctx, F, { xt: nice(0, 750, view.w < 520 ? 3 : 6).t, yt: [0], fy: function () { return "0"; }, zeroY: 0, xl: "time after the main peak  (M)", yl: "ψ far away" });
      }
      ctx.save();
      clip(ctx, F);
      function curve(Sx, col, wdt, dash) {
        var pts = [];
        for (var i = 0; i < Sx.y.length; i += 2) {
          var uu = (i - bh.ip) * Sx.dt;
          if (uu < VIEW[0] || uu > VIEW[1]) continue;
          pts.push([F.X(uu), F.clampY(F.Y(Sx.y[i]))]);
        }
        line(ctx, pts, col, wdt, dash);
      }
      curve(bh, "rgba(237, 239, 243, 0.3)", 1.1);
      curve(S, COL.ink, 1.3);
      ctx.restore();
      var px = F.X(gap) - F.X(0);
      var every = Math.max(1, Math.ceil(26 / px));
      for (var k = 1; k * gap < VIEW[1]; k += 1) {
        vline(ctx, F, F.X(k * gap), "rgba(140, 188, 255, 0.45)", [2, 4]);
        if ((k - 1) % every === 0) label(ctx, k === 1 && px > 64 ? "echo 1" : String(k), F.X(k * gap) + 5, F.y0 + 6, "left", "top", COL.acc);
      }
      label(ctx, "grey: black hole", F.x1 - 4, F.y1 - 8, "right", "bottom");
    }
    redraw(draw);
  };

  /* ======================================================================
     Lesson 12. Leaver's continued fraction as a landscape, and a convergence test
     ====================================================================== */

  /* Leaver's continued fraction for Schwarzschild gravitational perturbations
     (s = 2), inverted n times, at w = 2M omega = wr + i wi (units 2M = 1).
     Returns [Re f, Im f]. */
  function leaverCF(wr, wi, l, n, depth) {
    var pr = wi;
    var pi = -wr; // rho = -i w
    var p2r = pr * pr - pi * pi;
    var p2i = 2 * pr * pi;
    var L = l * (l + 1) - 3; // l(l+1) - eps, eps = s^2 - 1
    function al(k) { return [k * k + (2 * pr + 2) * k + 2 * pr + 1, 2 * pi * k + 2 * pi]; }
    function be(k) { return [-(2 * k * k + (8 * pr + 2) * k + 8 * p2r + 4 * pr + L), -((8 * k + 4) * pi + 8 * p2i)]; }
    function ga(k) { return [k * k + 4 * pr * k + 4 * p2r - 4, 4 * pi * k + 4 * p2i]; }
    var tr = 0;
    var ti = 0;
    for (var k = depth; k > n; k -= 1) {
      // tail = al(k-1) ga(k) / (be(k) - tail), inlined for speed
      var a1r = (k - 1) * (k - 1) + (2 * pr + 2) * (k - 1) + 2 * pr + 1;
      var a1i = 2 * pi * k;
      var g1r = k * k + 4 * pr * k + 4 * p2r - 4;
      var g1i = 4 * pi * k + 4 * p2i;
      var nr = a1r * g1r - a1i * g1i;
      var ni = a1r * g1i + a1i * g1r;
      var dr = -(2 * k * k + (8 * pr + 2) * k + 8 * p2r + 4 * pr + L) - tr;
      var di = -((8 * k + 4) * pi + 8 * p2i) - ti;
      var dd = dr * dr + di * di;
      tr = (nr * dr + ni * di) / dd;
      ti = (ni * dr - nr * di) / dd;
    }
    var hr = 0;
    var hi = 0;
    if (n > 0) {
      var x = be(0);
      for (var j = 1; j < n; j += 1) {
        var q = cd(cm(al(j - 1), ga(j)), x);
        var b = be(j);
        x = [b[0] - q[0], b[1] - q[1]];
      }
      var h = cd(cm(al(n - 1), ga(n)), x);
      hr = h[0];
      hi = h[1];
    }
    var bn = be(n);
    return [bn[0] - tr - hr, bn[1] - ti - hi];
  }

  W.cfmap = function (fig) {
    var u = layout(fig);
    var view = panel(u.stage, "w-h-xl", "Leaver's continued fraction in the complex frequency plane: bright wells are its zeros, the quasinormal modes; click to run a root finder from that point");
    var s = { l: 2, n: 0, path: null, hx: null, hy: null };
    var XR = [0, 1];
    var YR = [-1.05, 0.05];
    var GW = 200;
    var GH = 180;
    var DEPTH = 250;
    var cache = {};
    var F = null;
    var busy = false;

    seg(u.ctrl, { label: "Multipole ℓ", options: [[2, "2"], [3, "3"], [4, "4"]], value: 2, on: function (v) { s.l = v; s.path = null; queue(); } });
    seg(u.ctrl, { label: "Inverted for overtone", options: [[0, "n = 0"], [1, "1"], [2, "2"], [3, "3"]], value: 0, on: function (v) { s.n = v; s.path = null; queue(); } });
    button(u.ctrl, "Clear the path", function () { s.path = null; draw(); });
    var read = readout(u.ctrl);

    // 0 = deep zero (bright), 1 = large (dark); single hue, from the background to the accent
    var LO = -1.7;
    var HI = 0.9;
    function shade(z) {
      var t = Math.max(0, Math.min(1, (HI - z) / (HI - LO)));
      var b = Math.pow(t, 1.9);
      var band = ((z - LO) * 2.5) % 1;
      if (band < 0) band += 1;
      if (band < 0.07 && t > 0.08) b = Math.min(1, b + 0.05 + 0.06 * t);
      var w = Math.max(0, (t - 0.86) / 0.14); // the bottom of a well turns almost white
      return [
        7 + (140 - 7) * b + (237 - 140) * w * b,
        9 + (188 - 9) * b + (239 - 188) * w * b,
        14 + (255 - 14) * b + (243 - 255) * w * b,
      ];
    }

    function image(l, n) {
      var key = l + ":" + n;
      if (cache[key]) return cache[key];
      var off = document.createElement("canvas");
      off.width = GW;
      off.height = GH;
      var g = off.getContext("2d");
      var img = g.createImageData(GW, GH);
      for (var j = 0; j < GH; j += 1) {
        var im = YR[1] - ((j + 0.5) / GH) * (YR[1] - YR[0]);
        for (var i = 0; i < GW; i += 1) {
          var re = XR[0] + ((i + 0.5) / GW) * (XR[1] - XR[0]);
          var f = leaverCF(2 * re, 2 * im, l, n, DEPTH);
          // divided by a smooth function that grows like the first term of the fraction
          var z = Math.log10(Math.hypot(f[0], f[1]) + 1e-300) - Math.log10(32 * (re * re + im * im) + 6);
          var c = shade(z);
          var o = 4 * (j * GW + i);
          img.data[o] = c[0];
          img.data[o + 1] = c[1];
          img.data[o + 2] = c[2];
          img.data[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      cache[key] = off;
      return off;
    }

    // secant method in w = 2M omega from a start point given in M omega
    function seek(re, im) {
      var l = s.l;
      var n = s.n;
      function f(w) { var v = leaverCF(w[0], w[1], l, n, 1000); return [v[0], v[1]]; }
      var x0 = [2 * re, 2 * im];
      var x1 = [2 * re * (1 + 1e-3) + 1e-4, 2 * im * (1 + 1e-3)];
      var f0 = f(x0);
      var f1 = f(x1);
      var pts = [[re, im]];
      for (var k = 0; k < 40; k += 1) {
        var df = [f1[0] - f0[0], f1[1] - f0[1]];
        var step = cd(cm(f1, [x1[0] - x0[0], x1[1] - x0[1]]), df);
        var x2 = [x1[0] - step[0], x1[1] - step[1]];
        if (!isFinite(x2[0]) || !isFinite(x2[1])) break;
        pts.push([x2[0] / 2, x2[1] / 2]);
        if (cabs(step) < 1e-11 * Math.max(1, cabs(x2))) return { pts: pts, ok: true, steps: k + 1 };
        if (cabs(x2) > 20) break;
        x0 = x1;
        f0 = f1;
        x1 = x2;
        f1 = f(x2);
      }
      return { pts: pts, ok: false, steps: pts.length - 1 };
    }

    function describe() {
      var txt = "";
      if (!s.path) {
        read.textContent = "Click or tap anywhere on the map:\nthe secant method starts there\nand walks to a zero.";
        return;
      }
      var p = s.path.pts;
      var end = p[p.length - 1];
      txt = "Start  Mω = " + cplx(p[0][0], p[0][1], 3);
      if (!s.path.ok) {
        read.textContent = txt + "\nNo convergence in " + s.path.steps + " steps:\nthe walk left the map. Start closer.";
        return;
      }
      txt += "\nAfter " + s.path.steps + " steps\n  Mω = " + cplx(end[0], end[1], 6);
      var best = -1;
      var dist = 1;
      QNM[s.l].forEach(function (q, k) {
        var d = Math.min(Math.hypot(end[0] - q[0], end[1] - q[1]), Math.hypot(end[0] + q[0], end[1] - q[1]));
        if (d < dist) { dist = d; best = k; }
      });
      if (dist < 2e-6) txt += "\nThe overtone n = " + best + " of Lesson 6" + (end[0] < 0 ? ",\nturning the other way." : ".");
      else txt += "\nA zero that is not in the table\nof Lesson 6.";
      read.textContent = txt;
    }

    function draw() {
      describe();
      if (!view.fit()) return;
      var ctx = view.ctx;
      F = frame(view, [24, 14, 40, 46], XR, YR);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(image(s.l, s.n), F.x0, F.y0, F.x1 - F.x0, F.y1 - F.y0);
      ctx.restore();
      axes(ctx, F, { xt: [0, 0.2, 0.4, 0.6, 0.8, 1], yt: [-1, -0.8, -0.6, -0.4, -0.2, 0], fx: function (v) { return v.toFixed(1); }, fy: function (v) { return v.toFixed(1); }, xl: "Re Mω", yl: "Im Mω" });
      ctx.save();
      clip(ctx, F);
      QNM[s.l].forEach(function (q, k) {
        if (q[1] < YR[0]) return;
        var x = F.X(q[0]);
        var y = F.Y(q[1]);
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, TAU);
        ctx.strokeStyle = "rgba(7, 9, 14, 0.85)"; // a dark edge keeps the ring visible inside a bright well
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = k === s.n ? COL.pulse : "rgba(237, 239, 243, 0.85)";
        ctx.lineWidth = k === s.n ? 1.8 : 1.2;
        ctx.stroke();
        tag(ctx, String(k), x + 11, y, "left", k === s.n ? COL.pulse : COL.ink2);
      });
      if (s.path) {
        var pts = s.path.pts.map(function (p) { return [F.X(p[0]), F.Y(p[1])]; });
        line(ctx, pts, COL.ink, 1.2, [3, 3]);
        pts.forEach(function (p, k) { if (k) dot(ctx, p[0], p[1], 2, COL.ink); });
        dot(ctx, pts[0][0], pts[0][1], 4, COL.pos, true);
        if (s.path.ok) dot(ctx, pts[pts.length - 1][0], pts[pts.length - 1][1], 3.5, COL.ink, true);
      }
      ctx.restore();
      tag(ctx, "rings: the modes of Lesson 6", F.x1 - 8, F.y0 + 12, "right", COL.ink2);
      if (view.w >= 520) tag(ctx, "orange: the overtone the inversion is for", F.x1 - 8, F.y0 + 30, "right", COL.pulse);
      if (s.hx != null && !busy) {
        QNM[s.l].forEach(function (q, k) {
          var x = F.X(q[0]);
          var y = F.Y(q[1]);
          if (q[1] >= YR[0] && Math.hypot(x - s.hx, y - s.hy) < 9) {
            tooltip(ctx, view, x, y, [{ t: "ℓ = " + s.l + ", n = " + k, head: true }, { t: "Mω = " + cplx(q[0], q[1], 6) }]);
          }
        });
      }
    }

    function queue() {
      busy = true;
      read.textContent = "Computing the map…";
      window.setTimeout(function () { busy = false; draw(); }, 20);
    }

    view.c.addEventListener("click", function (e) {
      if (!F) return;
      var r = view.c.getBoundingClientRect();
      var x = e.clientX - r.left;
      var y = e.clientY - r.top;
      if (x < F.x0 || x > F.x1 || y < F.y0 || y > F.y1) return;
      s.path = seek(F.invX(x), F.invY(y));
      draw();
    });
    view.c.style.cursor = "crosshair";
    hover(view, function (x, y) { s.hx = x; s.hy = y; draw(); });
    s.path = seek(0.56, -0.62);
    redraw(draw);
  };

  W.converge = function (fig) {
    var u = layout(fig);
    var top = panel(u.stage, "w-h-md", "The same signal computed on three grids, each twice as fine as the last, on a logarithmic scale");
    var bot = panel(u.stage, "w-h-md", "The change between the coarse and middle grids, and between the middle and fine grids multiplied by two to the power p");
    var s = { h: 0.4, p: 2 };
    var cache = {};
    var EX = QNM[2][0];
    seg(u.ctrl, { label: "Grids  Δx", options: [[0.8, "0.8 · 0.4 · 0.2"], [0.4, "0.4 · 0.2 · 0.1"]], value: 0.4, wide: true, on: function (v) { s.h = v; queue(); } });
    seg(u.ctrl, { label: "Assumed order  p", options: [[1, "1"], [2, "2"], [3, "3"]], value: 2, on: function (v) { s.p = v; draw(); } });
    var read = readout(u.ctrl);
    var C = [COL.ink3, COL.acc, COL.ink];

    function runs(h) {
      if (cache[h]) return cache[h];
      var out = [h, h / 2, h / 4].map(function (dx) {
        return evolve({
          x0: -150, x1: 260, dx: dx, T: 250, obs: 100,
          V: function (x) { return POT.rw(rOf(x), 2); },
          init: function (x) { var z = x - 50; return Math.exp((-z * z) / 72) * Math.cos(0.4 * z); },
        });
      });
      // on the time grid of the coarsest run
      var n = out[0].y.length;
      var y = out.map(function (S, k) {
        var e = 1 << k;
        var a = new Float64Array(n);
        for (var i = 0; i < n; i += 1) a[i] = S.y[i * e];
        return a;
      });
      var d1 = new Float64Array(n);
      var d2 = new Float64Array(n);
      var s1 = 0;
      var s2 = 0;
      for (var i = 0; i < n; i += 1) {
        d1[i] = y[0][i] - y[1][i];
        d2[i] = y[1][i] - y[2][i];
        s1 += d1[i] * d1[i];
        s2 += d2[i] * d2[i];
      }
      var tp = out[2].tp;
      var fits = out.map(function (S) {
        var step = Math.round(0.4 / S.dt);
        return prony(S.y, Math.round((tp + 50) / S.dt), Math.round((tp + 90) / S.dt), step, step * S.dt);
      });
      cache[h] = { dt: out[0].dt, y: y, d1: d1, d2: d2, p: Math.log2(Math.sqrt(s1 / s2)), fits: fits, tp: tp };
      return cache[h];
    }

    function draw() {
      var R = runs(s.h);
      var hs = [s.h, s.h / 2, s.h / 4];
      var f = R.fits;
      var rich = [(4 * f[2][0] - f[1][0]) / 3, (4 * f[2][1] - f[1][1]) / 3];
      var txt = "Measured order  p = " + R.p.toFixed(2) + "\nFrequency, fitted +50M to +90M\nafter the peak:\n";
      hs.forEach(function (h, k) { txt += "  Δx = " + String(h).padEnd(5) + cplx(f[k][0], f[k][1], 6) + "\n"; });
      txt += "Richardson    " + cplx(rich[0], rich[1], 6) + "\nLeaver        " + cplx(EX[0], EX[1], 6);
      read.textContent = txt;
      var n = R.y[0].length;
      var dt = R.dt;
      var every = Math.max(1, Math.round(0.4 / dt));
      if (top.fit()) {
        var ctx = top.ctx;
        var G = frame(top, [24, 14, 40, 46], [0, 250], [-10, 0.3], true);
        axes(ctx, G, { xt: [0, 50, 100, 150, 200, 250], yt: [-10, -8, -6, -4, -2, 0], fy: function (e) { return e === 0 ? "1" : "1e" + e; }, xl: "time  (M)", yl: "|ψ| at r* = 100M" });
        ctx.save();
        clip(ctx, G);
        for (var k = 0; k < 3; k += 1) {
          var pts = [];
          for (var i = 0; i < n; i += every) pts.push([G.X(i * dt), G.clampY(G.Y(R.y[k][i]))]);
          line(ctx, pts, C[k], k === 2 ? 1.1 : 1.6);
        }
        ctx.restore();
        legend(ctx, G, hs.map(function (h, k) { return { name: "Δx = " + h, c: C[k] }; }));
      }
      if (bot.fit()) {
        var c2 = bot.ctx;
        var H = frame(bot, [24, 14, 40, 46], [0, 250], [-10, -0.5], true);
        axes(c2, H, { xt: [0, 50, 100, 150, 200, 250], yt: [-10, -8, -6, -4, -2], fy: function (e) { return "1e" + e; }, xl: "time  (M)", yl: "change between grids" });
        var sc = Math.pow(2, s.p);
        c2.save();
        clip(c2, H);
        var p1 = [];
        var p2 = [];
        for (var j = 0; j < n; j += every) {
          p1.push([H.X(j * dt), H.clampY(H.Y(R.d1[j]))]);
          p2.push([H.X(j * dt), H.clampY(H.Y(sc * R.d2[j]))]);
        }
        line(c2, p1, COL.pulse, 1.6);
        line(c2, p2, COL.acc, 1.4, [5, 3]);
        c2.restore();
        legend(c2, H, [{ name: "Δx " + hs[0] + " → " + hs[1], c: COL.pulse }, { name: sc + " × (Δx " + hs[1] + " → " + hs[2] + ")", c: COL.acc, dash: [5, 3] }]);
      }
    }

    function queue() {
      read.textContent = "Running three simulations…";
      window.setTimeout(draw, 20);
    }
    redraw(draw);
  };

  /* ---------- start ---------- */

  Array.prototype.forEach.call(document.querySelectorAll("figure[data-widget]"), function (fig) {
    var make = W[fig.dataset.widget];
    if (!make) return;
    try {
      make(fig);
      fig.classList.add("is-live");
    } catch (err) {
      if (window.console) console.error(err);
    }
  });
})();
