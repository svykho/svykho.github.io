/* The home page: an Ellis wormhole, r(l) = sqrt(l^2 + b^2), z(l) = b asinh(l/b),
   drawn as a hidden-line grid. A wave packet comes in from our side, crosses the
   throat and leaves through the other universe. */
(function () {
  "use strict";

  var canvas = document.getElementById("sky");
  var gl = canvas && canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
  if (!gl) {
    document.documentElement.classList.add("no-gl");
    return;
  }

  var LMAX = 17;
  var NL = 120;
  var NP = 144;
  var EVERY = 3;
  var MAX_PIXELS = 2.6e6; // keeps the animation smooth on large, dense screens

  var vs = [
    "precision highp float;",
    "attribute vec2 a;",
    "uniform mat4 M; uniform vec2 shift; uniform float pulse, spin;",
    "varying float vFade, vGlow;",
    "void main(){",
    "  float l = a.x, r = sqrt(l*l + 1.);",
    "  float z = sign(l)*log(abs(l) + r);",
    "  float x = (l - pulse)/1.15;",
    "  float g = exp(-x*x);",
    "  vGlow = g;",
    "  r += .13*g*cos(3.2*x);",
    "  z += .10*g*sin(3.2*x);",
    "  float p = a.y + spin;",
    "  gl_Position = M*vec4(r*cos(p), r*sin(p), z, 1.);",
    "  gl_Position.xy += shift*gl_Position.w;",
    "  float e = abs(l)/" + LMAX.toFixed(1) + ";",
    "  vFade = (1. - smoothstep(.22, .98, e))*(l < 0. ? mix(1., .5, clamp(-l/2.5, 0., 1.)) : 1.);",
    "}",
  ].join("\n");

  var fs = [
    "precision mediump float;",
    "varying float vFade, vGlow;",
    "void main(){",
    "  vec3 c = mix(vec3(.27,.55,.98), vec3(.9,.95,1.), vGlow);",
    "  float a = vFade*(.62 + .38*vGlow);",
    "  gl_FragColor = vec4(c*a, a);",
    "}",
  ].join("\n");

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
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    document.documentElement.classList.add("no-gl");
    return;
  }
  gl.useProgram(prog);

  /* mesh: rings are denser near the throat */
  var verts = new Float32Array((NL + 1) * NP * 2);
  var k = 0;
  for (var i = 0; i <= NL; i += 1) {
    var s = (2 * i) / NL - 1;
    var l = (LMAX * Math.sinh(2.5 * s)) / Math.sinh(2.5);
    for (var j = 0; j < NP; j += 1) {
      verts[k++] = l;
      verts[k++] = (2 * Math.PI * j) / NP;
    }
  }
  var id = function (a, b) { return a * NP + ((b + NP) % NP); };
  var tris = [];
  var lines = [];
  for (i = 0; i <= NL; i += 1) {
    for (j = 0; j < NP; j += 1) {
      if (i < NL) tris.push(id(i, j), id(i + 1, j), id(i, j + 1), id(i, j + 1), id(i + 1, j), id(i + 1, j + 1));
      if (i % EVERY === 0) lines.push(id(i, j), id(i, j + 1));
      if (i < NL && j % EVERY === 0) lines.push(id(i, j), id(i + 1, j));
    }
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var triBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(tris), gl.STATIC_DRAW);
  var lineBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(lines), gl.STATIC_DRAW);

  var uM = gl.getUniformLocation(prog, "M");
  var uShift = gl.getUniformLocation(prog, "shift");
  var uPulse = gl.getUniformLocation(prog, "pulse");
  var uSpin = gl.getUniformLocation(prog, "spin");

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.polygonOffset(1.5, 2);

  /* small matrix helpers (column-major) */
  function perspective(fov, aspect, near, far) {
    var f = 1 / Math.tan(fov / 2);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  }
  function norm(v) {
    var n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function lookAt(e, c, up) {
    var f = norm([c[0] - e[0], c[1] - e[1], c[2] - e[2]]);
    var r = norm(cross(f, up));
    var u = cross(r, f);
    return [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, e), -dot(u, e), dot(f, e), 1];
  }
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c += 1) {
      for (var r = 0; r < 4; r += 1) {
        var v = 0;
        for (var m = 0; m < 4; m += 1) v += a[m * 4 + r] * b[c * 4 + m];
        o[c * 4 + r] = v;
      }
    }
    return o;
  }

  var W = 1;
  var H = 1;
  var px = 0;
  var py = 0;
  var tx = 0;
  var ty = 0;

  function resize() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    if (!W || !H) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / (W * H)));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  /* the packet crosses in 13 s, then the throat rests for 5 s */
  function pulseAt(t) {
    var T = 18;
    var u = (((t + 5) % T) + T) % T;
    return u < 13 ? 13 - (26 * u) / 13 : -40;
  }

  function draw(t) {
    if (!W || !H) return;
    px += (tx - px) * 0.025;
    py += (ty - py) * 0.025;

    var portrait = H > W;
    var az = -1.15 + 0.07 * Math.sin(t * 0.13) + px * 0.09;
    var el = (portrait ? 0.92 : 0.86) + 0.035 * Math.sin(t * 0.17 + 1) - py * 0.05;
    var dist = portrait ? 25 : 16.5;
    var e = [dist * Math.cos(el) * Math.cos(az), dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el)];

    var M = mul(perspective(0.68, W / H, 0.5, 80), lookAt(e, [0, 0, -0.7], [0, 0, 1]));
    gl.uniformMatrix4fv(uM, false, M);
    if (portrait) gl.uniform2f(uShift, 0.12, 0.64); // the throat sits above the name
    else gl.uniform2f(uShift, 0.36, 0.06);
    gl.uniform1f(uPulse, pulseAt(t));
    gl.uniform1f(uSpin, t * 0.022);

    gl.clearColor(0, 0, 0, 0);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    /* depth only: the surface hides whatever is behind it */
    gl.colorMask(false, false, false, false);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triBuf);
    gl.drawElements(gl.TRIANGLES, tris.length, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL);

    gl.colorMask(true, true, true, true);
    gl.depthMask(false);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineBuf);
    gl.drawElements(gl.LINES, lines.length, gl.UNSIGNED_SHORT, 0);
  }

  window.addEventListener("resize", function () {
    resize();
    if (window.ASK.still) draw(2);
  });
  window.addEventListener("pointermove", function (ev) {
    if (ev.pointerType === "touch") return;
    tx = (ev.clientX / window.innerWidth) * 2 - 1;
    ty = (ev.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  resize();
  window.ASK.onFrame(function (t) { draw(window.ASK.still ? 2 : t); });
})();
