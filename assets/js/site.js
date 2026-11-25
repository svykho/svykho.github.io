/* The float: every [data-float] element rides the same slow travelling wave.
   Neighbours have almost the same phase, so they drift together and the grid
   never breaks. An element comes to rest under the pointer or keyboard focus,
   so links are never moving targets. */
(function () {
  "use strict";

  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var KX = 0.0011; // long wavelengths: a row of cards stays visibly a row
  var KY = 0.0026;
  var SWAY = 0.22; // sideways drift is small so left edges stay aligned
  var OMEGA = (2 * Math.PI) / 12; // one swell every 12 s
  var callbacks = [];
  var clock = 0;
  var last = 0;

  function amplitude() {
    return window.innerWidth < 820 ? 3.5 : 6.5;
  }

  /* ---------- floating elements ---------- */

  var items = Array.prototype.map.call(document.querySelectorAll("[data-float]"), function (el, i) {
    el.style.setProperty("--i", Math.min(i, 14));
    var item = { el: el, depth: Number(el.dataset.float) || 1, x: 0, y: 0, rest: 1, target: 1, seen: true };

    function settle() { item.target = 0; }
    function release() {
      if (!el.matches(":hover") && !el.matches(":focus-within")) item.target = 1;
    }
    el.addEventListener("pointerenter", settle);
    el.addEventListener("pointerleave", release);
    el.addEventListener("focusin", settle);
    el.addEventListener("focusout", function () { setTimeout(release, 0); });
    return item;
  });

  function measure() {
    items.forEach(function (it) {
      var r = it.el.getBoundingClientRect();
      it.x = r.left + r.width / 2 + window.scrollX;
      it.y = r.top + r.height / 2 + window.scrollY;
    });
  }

  if (!still) {
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { e.target.__float.seen = e.isIntersecting; });
      }, { rootMargin: "120px" });
      items.forEach(function (it) { it.el.__float = it; io.observe(it.el); });
    }
    measure();
    window.addEventListener("load", measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    if ("ResizeObserver" in window) new ResizeObserver(measure).observe(document.body);
  }

  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    clock += dt;
    var A = amplitude();
    var sy = window.scrollY;

    for (var i = 0; i < items.length; i += 1) {
      var it = items[i];
      if (!it.seen) continue;
      it.rest += (it.target - it.rest) * 0.07;
      var ph = KX * it.x + KY * (it.y - sy) - OMEGA * clock;
      var a = A * it.depth * it.rest;
      it.el.style.translate = (SWAY * a * Math.cos(ph)).toFixed(2) + "px " + (a * Math.sin(ph)).toFixed(2) + "px";
    }

    for (var c = 0; c < callbacks.length; c += 1) callbacks[c](clock);
    window.requestAnimationFrame(frame);
  }

  window.ASK = {
    still: still,
    onFrame: function (fn) {
      callbacks.push(fn);
      if (still) fn(0);
    },
  };

  /* ---------- the lattice behind the inner pages ---------- */

  function lattice(canvas) {
    var gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true });
    if (!gl) return;

    var vs =
      "attribute vec2 p; uniform vec2 res; uniform float t, amp, dpr;" +
      "varying float v;" +
      "void main(){" +
      " float ph = " + KX + "*p.x + " + KY + "*p.y - " + OMEGA + "*t;" +
      " vec2 q = p + amp*vec2(" + SWAY.toFixed(2) + "*cos(ph), sin(ph));" +
      " vec2 c = q/res*2.-1.;" +
      " gl_Position = vec4(c.x, -c.y, 0., 1.);" +
      " gl_PointSize = 1.7*dpr;" +
      " v = .075 + .16*pow(.5+.5*sin(ph), 3.);" +
      "}";
    var fs =
      "precision mediump float; varying float v;" +
      "void main(){ float d = length(gl_PointCoord-.5); float a = v*smoothstep(.5,.2,d);" +
      " gl_FragColor = vec4(vec3(.62,.78,1.)*a, a); }";

    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    var buf = gl.createBuffer();
    var loc = gl.getAttribLocation(prog, "p");
    var uRes = gl.getUniformLocation(prog, "res");
    var uT = gl.getUniformLocation(prog, "t");
    var uAmp = gl.getUniformLocation(prog, "amp");
    var uDpr = gl.getUniformLocation(prog, "dpr");
    var count = 0;

    function resize() {
      var w = canvas.clientWidth;
      var h = canvas.clientHeight;
      if (!w || !h) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);

      var step = w < 820 ? 34 : 44;
      var pts = [];
      for (var y = step / 2; y < h + step; y += step) {
        for (var x = step / 2; x < w + step; x += step) pts.push(x, y);
      }
      count = pts.length / 2;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uDpr, dpr);
      gl.uniform1f(uAmp, amplitude() * 1.6);
      draw(clock);
    }

    function draw(t) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uT, t);
      gl.drawArrays(gl.POINTS, 0, count);
    }

    window.addEventListener("resize", resize);
    resize();
    window.ASK.onFrame(draw);
  }

  var sky = document.getElementById("sky");
  if (sky && document.body.dataset.sky === "lattice") lattice(sky);

  /* ---------- gallery viewer ---------- */

  var view = document.querySelector("dialog.view");
  if (view && view.showModal) {
    var big = view.querySelector("img");
    var cap = view.querySelector("p");
    document.querySelectorAll("[data-full]").forEach(function (b) {
      b.addEventListener("click", function () {
        big.src = b.dataset.full;
        big.alt = b.querySelector("img").alt;
        cap.textContent = b.dataset.caption;
        view.showModal();
      });
    });
    view.querySelector(".close").addEventListener("click", function () { view.close(); });
    view.addEventListener("click", function (e) {
      if (e.target === view) view.close();
    });
    view.addEventListener("close", function () { big.removeAttribute("src"); });
  }

  if (!still) {
    window.requestAnimationFrame(function (now) {
      last = now;
      window.requestAnimationFrame(frame);
    });
  }
})();
