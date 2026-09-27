/* Mentifaber — "Survey Field" background
 * A raymarched landscape milled in Z-level terraces (like a CNC roughing pass),
 * gold on the chamfered steps, ember haze at the horizon, and a survey ping that
 * sweeps the ground. Scrolling lowers the camera (the descent) and drives a
 * finishing pass: a glowing ember cut line advances toward you and leaves finer
 * terraces behind it. Click or tap the ground to send your own survey ping.
 *
 * Drop-in: add a script tag with src="mf-terrain.js" and defer.
 * Optional: any button with data-mf-motion toggles animation.
 * Optional: any element with data-mf-readout gets a live one-line status.
 * No libraries. WebGL1. Falls back to plain black if WebGL is unavailable.
 */
(function () {
  "use strict";

  var VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

  var FRAG = [
    "precision highp float;",
    "uniform vec2 uRes;uniform float uTime;uniform float uScroll;uniform vec2 uMouse;uniform float uFront;uniform vec3 uPing;",
    "const vec3 GOLD=vec3(0.79,0.63,0.29);",
    "const vec3 EMBER=vec3(0.72,0.22,0.12);",
    "float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}",
    "float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);",
    " return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}",
    "float fbm(vec2 p){float a=.5,s=0.;mat2 m=mat2(1.6,1.2,-1.2,1.6);",
    " for(int i=0;i<4;i++){s+=a*noise(p);p=m*p;a*=.5;}return s;}",
    "float kAt(vec2 p){return p.y>uFront?15.:7.;}",
    "float base(vec2 p){return fbm(p*.33);}",
    // terrace: flat step, then a short chamfered ramp to the next level
    "float terr(float n,float k){float v=n*k;float f=fract(v);return (floor(v)+smoothstep(.91,1.,f))/k;}",
    "float H(vec2 p){return terr(base(p),kAt(p))*2.3;}",
    "void main(){",
    " vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;",
    " float T=uTime;",
    " vec3 ro=vec3(sin(T*.045)*2.5,0.,T*.28);",
    " ro.y=base(ro.xz)*2.3+mix(1.55,.55,uScroll);",
    " float yaw=uMouse.x*.10+sin(T*.03)*.08;",
    " float pitch=-.20-.14*uScroll+uMouse.y*.05;",
    " vec3 fw=normalize(vec3(sin(yaw),pitch,cos(yaw)));",
    " vec3 rt=normalize(cross(vec3(0,1,0),fw));vec3 up=cross(fw,rt);",
    " vec3 rd=normalize(fw*1.55+uv.x*rt+uv.y*up);",
    " float t=.05,tp=.05;bool hit=false;",
    " for(int i=0;i<120;i++){vec3 p=ro+rd*t;float d=p.y-H(p.xz);",
    "  if(d<0.){hit=true;break;}",
    "  tp=t;t+=max(d*.45,.004+.005*t);if(t>46.)break;}",
    " if(hit){for(int j=0;j<6;j++){float tm=.5*(tp+t);vec3 p=ro+rd*tm;if(p.y-H(p.xz)<0.)t=tm;else tp=tm;}}",
    " float hz=pow(clamp(1.-abs(rd.y)*5.5,0.,1.),4.);",
    " vec3 sky=EMBER*.30*hz+GOLD*.22*exp(-abs(rd.y+.004)*180.);",
    " vec3 col=sky;",
    " if(hit){",
    "  vec3 p=ro+rd*t;float e=.006+.0025*t;",
    "  vec3 n=normalize(vec3(H(p.xz-vec2(e,0))-H(p.xz+vec2(e,0)),2.*e,H(p.xz-vec2(0,e))-H(p.xz+vec2(0,e))));",
    "  float slope=1.-n.y;",
    "  float wall=smoothstep(.08,.35,slope);",
    "  float K=kAt(p.xz);float v=base(p.xz)*K;float fv=fract(v);float lvl=floor(v)/K;",
    "  vec3 L=normalize(vec3(-.4,.55,.7));",
    "  float dif=max(dot(n,L),0.);",
    "  vec3 flatC=vec3(.010,.009,.008)+vec3(.02,.016,.012)*dif;",
    "  vec2 g=abs(fract(p.xz*2.)-.5);float w=.012+.003*t;",
    "  float grid=(1.-smoothstep(0.,w,min(g.x,g.y)*.5))*exp(-t*.13);",
    "  flatC+=GOLD*.14*grid;",
    // plateau rim: thin bright contour just past the top of each wall
    "  float b0=base(p.xz);vec2 gb=vec2(base(p.xz+vec2(e,0))-b0,base(p.xz+vec2(0,e))-b0)/e;",
    "  float dist=fv/max(length(gb)*K,1e-3);",
    "  float rim=(1.-smoothstep(.006+.0016*t,.02+.0045*t,dist))*(1.-wall);",
    // walls: dark, with fine machined layer lines
    "  float layer=1.-smoothstep(0.,.18,abs(fract(p.y*26.)-.5)*2.-.62);",
    "  vec3 wallC=vec3(.02,.012,.008)+EMBER*.10*dif+GOLD*.16*layer*exp(-t*.08);",
    "  col=mix(flatC,wallC,wall);",
    "  col+=GOLD*rim*(.55+.9*lvl)*(.35+.65*exp(-t*.05));",    // survey ping: a ring that sweeps outward from ahead of the camera
    "  float per=9.;float ph=mod(T,per)/per;",
    "  vec2 c=ro.xz+vec2(sin(yaw),cos(yaw))*6.;",
    "  float r=ph*22.;float ring=exp(-pow((length(p.xz-c)-r)*2.2,2.))*(1.-ph)*(1.-ph);",
    "  col+=GOLD*ring*(.30+.9*(wall+rim));",
    // user ping
    "  float age=T-uPing.z;",
    "  if(age>0.&&age<6.){float r2=age*6.;float a2=1.-age/6.;",
    "   col+=GOLD*exp(-pow((length(p.xz-uPing.xy)-r2)*2.4,2.))*a2*a2*(.45+1.1*(wall+rim));",
    "   col+=GOLD*.35*exp(-length(p.xz-uPing.xy)*3.)*exp(-age*1.5);}",
    // the cut: ember front of the finishing pass
    "  float dz=p.z-uFront;",
    "  float heat=exp(-abs(dz)*5.);",
    "  col+=EMBER*(.55*heat+.45*heat*wall)+GOLD*.55*exp(-abs(dz)*30.);",
    "  col+=EMBER*.10*exp(-max(dz,0.)*1.2)*step(0.,dz);",
    "  float fog=1.-exp(-t*.075);",
    "  col=mix(col,EMBER*.26*hz+vec3(.006,.002,.001),fog);",
    " }",
    " vec2 q=gl_FragCoord.xy/uRes;col*=.55+.45*pow(16.*q.x*q.y*(1.-q.x)*(1.-q.y),.18);",
    " col=pow(col,vec3(.92));",
    " col+=(hash(gl_FragCoord.xy+fract(T))-.5)/255.*1.5;",
    " gl_FragColor=vec4(max(col,0.),1.);",
    "}"
  ].join("\n");

  function init() {
    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.className = "mf-terrain";
    var s = canvas.style;
    s.position = "fixed"; s.inset = "0"; s.width = "100%"; s.height = "100%";
    s.zIndex = "-1"; s.pointerEvents = "none"; s.background = "#000";
    document.body.insertBefore(canvas, document.body.firstChild);

    var gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) return;

    function sh(type, src) {
      var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(o)); return null; }
      return o;
    }
    var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var U = {
      res: gl.getUniformLocation(prog, "uRes"), time: gl.getUniformLocation(prog, "uTime"),
      scroll: gl.getUniformLocation(prog, "uScroll"), mouse: gl.getUniformLocation(prog, "uMouse"),
      front: gl.getUniformLocation(prog, "uFront"), ping: gl.getUniformLocation(prog, "uPing")
    };

    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var maxScale = dpr * 0.8, scale = maxScale * 0.8, minScale = 0.35;
    function resize() {
      var w = Math.max(1, Math.round(innerWidth * scale)), h = Math.max(1, Math.round(innerHeight * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    }
    addEventListener("resize", resize);
    resize();

    var mouse = [0, 0], mTarget = [0, 0], scroll = 0;
    addEventListener("pointermove", function (e) {
      mTarget[0] = e.clientX / innerWidth * 2 - 1; mTarget[1] = -(e.clientY / innerHeight * 2 - 1);
    }, { passive: true });
    function scrollTarget() {
      var max = document.documentElement.scrollHeight - innerHeight;
      return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    }

    function smooth(a, b, x) { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); }
    function frontZ() { return clock * 0.28 + 42 + (-3 - 42) * smooth(0.05, 0.9, scroll); }
    var ping = [0, 0, -100];

    // Click/tap the ground: cast the same camera ray the shader uses onto the local ground plane.
    addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest("a,button,input,textarea,select,label,[data-no-ping]")) return;
      var T = clock;
      var yaw = mouse[0] * 0.10 + Math.sin(T * 0.03) * 0.08;
      var pitch = -0.20 - 0.14 * scroll + mouse[1] * 0.05;
      var fw = norm([Math.sin(yaw), pitch, Math.cos(yaw)]);
      var rt = norm([fw[2], 0, -fw[0]]);
      var up = [fw[1] * rt[2] - fw[2] * rt[1], fw[2] * rt[0] - fw[0] * rt[2], fw[0] * rt[1] - fw[1] * rt[0]];
      var u = (e.clientX - innerWidth / 2) / innerHeight, v = -(e.clientY - innerHeight / 2) / innerHeight;
      var rd = norm([fw[0] * 1.55 + u * rt[0] + v * up[0], fw[1] * 1.55 + u * rt[1] + v * up[1], fw[2] * 1.55 + u * rt[2] + v * up[2]]);
      if (rd[1] > -0.02) return;
      var off = 1.55 + (0.55 - 1.55) * scroll, d = off / -rd[1];
      ping = [Math.sin(T * 0.045) * 2.5 + rd[0] * d, T * 0.28 + rd[2] * d, T];
      lastPing = [ping[0], ping[1]];
      wake();
    });
    function norm(a) { var l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }

    var readouts = document.querySelectorAll("[data-mf-readout]"), lastPing = null, lastText = "";
    function readout() {
      if (!readouts.length) return;
      var f = smooth(0.05, 0.9, scroll);
      var pass = f < 0.02 ? "roughing" : f > 0.98 ? "finished" : "finishing " + Math.round(f * 100) + "%";
      var txt = "alt " + (1.55 + (0.55 - 1.55) * scroll).toFixed(2) + " · pass " + pass +
        (lastPing ? " · ping x" + lastPing[0].toFixed(1) + " z" + lastPing[1].toFixed(1) : " · tap ground to survey");
      if (txt !== lastText) { lastText = txt; readouts.forEach(function (r) { r.textContent = txt; }); }
    }

    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var running = !reduce;
    var clock = 12.0, last = performance.now(), frames = 0, acc = 0;

    function draw() {
      resize();
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1f(U.time, clock);
      gl.uniform1f(U.scroll, scroll);
      gl.uniform2f(U.mouse, mouse[0], mouse[1]);
      gl.uniform1f(U.front, frontZ());
      gl.uniform3f(U.ping, ping[0], ping[1], ping[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function frame(now) {
      var dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (running) clock += dt;
      var k = 1 - Math.pow(0.02, dt);
      mouse[0] += (mTarget[0] - mouse[0]) * k; mouse[1] += (mTarget[1] - mouse[1]) * k;
      scroll += (scrollTarget() - scroll) * k;
      draw();
      readout();
      // adaptive resolution: hold ~50fps
      acc += dt; frames++;
      if (frames === 30) {
        var ms = acc / frames * 1000;
        if (ms > 22 && scale > minScale) scale = Math.max(minScale, scale * 0.82);
        else if (ms < 13 && scale < maxScale) scale = Math.min(maxScale, scale * 1.08);
        frames = 0; acc = 0;
      }
      if (running || Math.abs(scrollTarget() - scroll) > 0.001 || clock - ping[2] < 6) requestAnimationFrame(frame);
      else idle = true;
    }
    var idle = false;
    function wake() { if (idle) { idle = false; last = performance.now(); requestAnimationFrame(frame); } }
    addEventListener("scroll", wake, { passive: true });
    addEventListener("resize", wake);

    document.querySelectorAll("[data-mf-motion]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(!running));
      b.textContent = running ? "Pause motion" : "Play motion";
      b.addEventListener("click", function () {
        running = !running;
        b.setAttribute("aria-pressed", String(!running));
        b.textContent = running ? "Pause motion" : "Play motion";
        wake();
      });
    });

    draw();
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
