#!/usr/bin/env python3
"""Arma index.html para una voz: mide cada línea, transcribe (whisper large-v3, es) y
coloca cortes, deslizamientos y pulsos en la palabra exacta. Luego escribe los cues
del mezclador.   uso: python3 build.py voces/marco   (o assets/voice para Kokoro)"""
import json, os, re, subprocess, sys, unicodedata
VDIR = sys.argv[1].rstrip("/")
def dur(f): return float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f],capture_output=True,text=True).stdout)
def norm(w): return unicodedata.normalize("NFKD",w.lower()).encode("ascii","ignore").decode().strip(".,:;¡!¿?")
def words(i):
    al=f"{VDIR}/align-0{i}.json"
    if not os.path.exists(al):
        if os.path.exists(f"{VDIR}/transcript.json"): os.remove(f"{VDIR}/transcript.json")  # nunca leer uno viejo
        env=dict(os.environ,HYPERFRAMES_PYTHON=os.path.expanduser("~/.venv-tts/bin/python"))
        subprocess.run(["npx","hyperframes","transcribe",f"{VDIR}/0{i}.wav","-m","large-v3","-l","es","--json"],check=True,capture_output=True,env=env)
        os.replace(f"{VDIR}/transcript.json", al)  # transcribe deja transcript.json junto al wav
    return [(norm(w.get("text") or w.get("word","")), float(w["start"])) for w in json.load(open(al))]
def find(ws, key, default):
    keys=key if isinstance(key,tuple) else (key,)
    for w,t in ws:
        if any(w.startswith(k) for k in keys): return t
    print(f"  ! no encontré «{key}», uso {default:.2f}"); return default

N=5
D=[dur(f"{VDIR}/0{i}.wav") for i in range(1,N+1)]
LEAD=[1.1,1.0,1.0,1.0,1.0]; TAIL=[1.6,1.6,1.6,1.6,3.0]
start=[0.0]
for i in range(N):
    start.append(start[i]+LEAD[i]+D[i]+TAIL[i])
voice=[start[i]+LEAD[i] for i in range(N)]
total=round(start[N],3); cuts=[round(x,3) for x in start[1:N]]
W=[words(i) for i in range(1,N+1)]
def t(i,key,default): return round(voice[i]+find(W[i],key,default),2)
def has(i,key): return any(w.startswith(key) for w,_ in W[i])

k = dict(
 gasolinera=t(0,"gasolinera",0.05*D[0]), whats=t(0,"whats",0.3*D[0]), tanque=t(0,"tanque",0.45*D[0]), agua=t(0,"agua",0.55*D[0]), contesta=t(0,"contesta",0.68*D[0]), dato=t(0,"dato",0.8*D[0]), consola=t(0,"consola",0.93*D[0]),
 normi=t(1,"normi",0.02), semanas=t(1,"semanas",0.35*D[1]), sin=t(1,"sin",0.5*D[1]), servidor=t(1,"servidor",0.7*D[1]), ia=t(1,"inteligencia",0.85*D[1]),
 codigo=t(2,"codigo",0.05*D[2]), tools=t(2,("herramienta","tools","tols"),0.4*D[2]), mcp=t(2,("eme","msp","mcp"),0.5*D[2]), vig=t(2,"vigencias",0.62*D[2]), tan=t(2,"tanques",0.74*D[2]), rec=t(2,"recepciones",0.55*D[2]), nor=t(2,"normas",0.62*D[2]), conecta=t(2,"conecta",0.72*D[2]), agente3=t(2,"agente",0.82*D[2]), whats3=t(2,"whats",0.95*D[2]),
 easybits=t(3,("easybits","yasi","easy","isi"),0.02), caja=t(3,"caja",0.18*D[3]), cliente=t(3,"cliente",0.3*D[3]), modelo=t(3,"modelo",0.38*D[3]), memoria=t(3,"memoria",0.46*D[3]), canal=t(3,"canal",0.54*D[3]), pagas=t(3,("todo","cuota"),0.72*D[3]), agente4=t(3,"cuota",0.85*D[3]), trabaja=t(3,"mes",0.97*D[3]),
 normi2=t(4,"normi",0.02), formmy=t(4,("formmy","formie","formi"),0.12*D[4]), denik=t(4,("denik","the","deni"),0.22*D[4]), flota=t(4,"flota",0.4*D[4]), easy5=t(4,("isibits","easybits","ysi","isi"),0.5*D[4]), agentes=t(4,"agentes",0.58*D[4]), software=t(4,"software",0.7*D[4]), entra=t(4,"entra",0.82*D[4]), cloud=t(4,("cloud","yacybits","easybits.","isibits"),0.97*D[4]),
)
swaps=[round(k["contesta"]-0.45,2), round(k["sin"]-0.45,2), round(k["conecta"]-0.5,2), round(k["pagas"]-0.5,2), round(k["easy5"]-0.5,2)]
pulses=[k["agua"],k["consola"],k["semanas"],k["ia"],k["vig"],k["tan"],k["rec"],k["nor"],k["agente3"],k["whats3"],k["modelo"],k["memoria"],k["canal"],k["trabaja"],k["normi2"],k["formmy"],k["denik"],k["agentes"]]
hits=[k["caja"],k["pagas"],k["cloud"]]
s=[round(x,3) for x in start]; sd=[round(LEAD[i]+D[i]+TAIL[i],3) for i in range(N)]

html=open("index.html").read()
head=html.split("    <script>\n      (function () {")[0]
head=re.sub(r'data-duration="[\d.]+" data-width="1080"',f'data-duration="{total}" data-width="1080"',head)
head=re.sub(r'id="fondo" data-start="0" data-duration="[\d.]+"',f'id="fondo" data-start="0" data-duration="{total}"',head)
for i in range(N):
    head=re.sub(rf'id="esc-{i+1}" data-start="[\d.]+" data-duration="[\d.]+"',f'id="esc-{i+1}" data-start="{s[i]}" data-duration="{sd[i]}"',head)
    head=re.sub(rf'id="voz-0{i+1}" src="[^"]+" data-start="[\d.]+"\s+data-duration="[\d.]+"',f'id="voz-0{i+1}" src="{VDIR}/0{i+1}.wav" data-start="{round(voice[i],3)}" data-duration="{round(D[i],3)}"',head)
for j,c in enumerate(cuts):
    head=re.sub(rf'id="w{j+1}" data-start="[\d.]+"',f'id="w{j+1}" data-start="{round(c-0.3,3)}"',head)

reps=max(9,int(total/4)+1)
js=f'''    <script>
      (function () {{
        // GENERADO por build.py para {VDIR} — no editar a mano; edita build.py.
        window.__timelines = window.__timelines || {{}};
        var tl = gsap.timeline({{ paused: true }});
        var SWAP = {{ duration: 0.42, ease: "power4.inOut" }};
        function swap(a, b, t) {{
          tl.to(a, {{ xPercent: -200, duration: SWAP.duration, ease: SWAP.ease }}, t);
          tl.set(b, {{ opacity: 1 }}, t);
          tl.fromTo(b, {{ x: 0, xPercent: 100 }}, {{ x: 0, xPercent: 0, duration: SWAP.duration, ease: SWAP.ease }}, t); // x:0 anula el translateX del CSS
        }}
        function settle(sel, t, d) {{ tl.from(sel, {{ y: 26, duration: d || 0.5, ease: "power3.out" }}, t); }} // sin opacity: cuadro 0 completo
        function pulse(sel, t, s) {{ tl.to(sel, {{ scale: s || 1.22, duration: 0.18, ease: "power2.out", repeat: 1, yoyo: true, transformOrigin: "50% 50%" }}, t); }}
        function wipe(id, t) {{
          tl.to(id + " .col", {{ yPercent: 101, duration: 0.3, ease: "power3.in", stagger: 0.035 }}, t);
          tl.to(id + " .col", {{ yPercent: 202, duration: 0.32, ease: "power3.out", stagger: 0.035 }}, t + 0.3);
        }}
        function chip(sel, t) {{ tl.to(sel, {{ backgroundColor: "#D9FF3D", duration: 0.12 }}, t); pulse(sel, t); }}
        function tool(sel, t) {{ tl.to(sel, {{ backgroundColor: "#D9FF3D", color: "#111111", duration: 0.12 }}, t); pulse(sel, t, 1.12); }}
        // bandas giradas: el reposo (rotate) vive en CSS; GSAP solo escala
        function bandPulse(sel, t, s) {{ tl.to(sel, {{ scale: s || 1.06, rotation: -6, duration: 0.18, ease: "power2.out", repeat: 1, yoyo: true, transformOrigin: "50% 50%" }}, t); }}
        // FlipLetters (marca): la fila de atrás empieza de canto
        tl.set("#s5-fl .back span", {{ rotateX: 90 }}, 0);
        tl.set("#s5-fl .front span", {{ rotateX: 0 }}, 0);
        function flip(t) {{
          tl.to("#s5-fl .front span", {{ rotateX: 90, yPercent: -40, duration: 0.3, stagger: 0.05 }}, t);
          tl.to("#s5-fl .back span", {{ rotateX: 0, duration: 0.3, stagger: 0.05 }}, t);
        }}

        tl.to("#grid", {{ x: 60, y: 60, duration: 4, ease: "none", repeat: {reps} }}, 0);
        tl.to("#blob-a", {{ scale: 1.25, x: 80, duration: 3.2, ease: "sine.inOut", repeat: {reps+2}, yoyo: true }}, 0);
        tl.to("#blob-b", {{ scale: 1.2, y: -80, duration: 3.9, ease: "sine.inOut", repeat: {reps}, yoyo: true }}, 0.7);

        // Escena 1 · voz {voice[0]:.2f}
        settle("#s1-a .kicker", 0.05, 0.4);
        tl.from("#s1-q", {{ y: 40, rotation: -3, duration: 0.45, ease: "back.out(1.6)", transformOrigin: "50% 100%" }}, 0.12);
        settle("#s1-tag", 0.3);
        pulse("#s1-a .kicker", {k["gasolinera"]}, 1.06); pulse("#s1-tag", {k["whats"]}, 1.08); pulse("#s1-q", {k["tanque"]}, 1.05); pulse("#s1-q", {k["agua"]}, 1.08);
        swap("#s1-a", "#s1-b", {swaps[0]});
        tl.from("#s1-phone", {{ y: 80, rotation: -4, duration: 0.5, ease: "power3.out", transformOrigin: "50% 100%" }}, {swaps[0]+0.2});
        settle("#s1-h", {swaps[0]+0.4}); pulse("#s1-phone", {k["dato"]}, 1.03); pulse("#s1-h", {k["consola"]}, 1.08);

        // Escena 2 · voz {voice[1]:.2f}
        tl.from("#s2-robot", {{ y: 60, rotation: -4, duration: 0.5, ease: "back.out(1.4)", transformOrigin: "50% 100%" }}, {s[1]+0.05});
        settle("#s2-band", {s[1]+0.15}); settle("#s2-tag", {s[1]+0.3});
        pulse("#s2-tag", {k["normi"]}, 1.08); bandPulse("#s2-band", {k["semanas"]}, 1.1); pulse("#s2-robot", {k["semanas"]}, 1.04);
        swap("#s2-a", "#s2-b", {swaps[1]});
        settle("#s2-num", {swaps[1]+0.3}); settle("#s2-h", {swaps[1]+0.45});
        pulse("#s2-num", {k["servidor"]}, 1.12); pulse("#s2-h", {k["ia"]}, 1.06);

        // Escena 3 · voz {voice[2]:.2f}
        settle("#s3-a .kicker", {s[2]+0.04}, 0.4); settle("#s3-tag", {s[2]+0.12}); settle("#s3-tools", {s[2]+0.24});
        pulse("#s3-a .kicker", {k["codigo"]}, 1.05); pulse("#s3-tag", {k["mcp"]}, 1.1);
        tool("#t-vig", {k["vig"]}); tool("#t-tan", {k["tan"]}); tool("#t-rec", {k["rec"]}); tool("#t-nor", {k["nor"]});
        swap("#s3-a", "#s3-b", {swaps[2]});
        settle("#s3-n1", {swaps[2]+0.3}); settle("#s3-n2", {swaps[2]+0.42}); settle("#s3-n3", {swaps[2]+0.54});
        pulse("#s3-n1", {k["conecta"]}, 1.04); pulse("#s3-n2", {k["agente3"]}, 1.06); pulse("#s3-n3", {k["whats3"]}, 1.06);

        // Escena 4 · voz {voice[3]:.2f}
        tl.from("#s4-box", {{ y: 60, rotation: 4, duration: 0.5, ease: "back.out(1.4)", transformOrigin: "50% 100%" }}, {s[3]+0.05});
        settle("#s4-band", {s[3]+0.15}); settle("#s4-a .chips", {s[3]+0.3});
        pulse("#s4-box", {k["caja"]}, 1.08); bandPulse("#s4-band", {k["cliente"]}, 1.08);
        chip("#s4-c1", {k["modelo"]}); chip("#s4-c2", {k["memoria"]}); chip("#s4-c3", {k["canal"]});
        swap("#s4-a", "#s4-b", {swaps[3]});
        settle("#s4-b .kicker", {swaps[3]+0.3}, 0.4); settle("#s4-h", {swaps[3]+0.4}); settle("#s4-tag", {swaps[3]+0.55});
        pulse("#s4-h", {k["agente4"]}, 1.05); pulse("#s4-h", {k["trabaja"]}, 1.1); pulse("#s4-tag", {k["trabaja"]+0.3}, 1.08);

        // Escena 5 · voz {voice[4]:.2f}
        settle("#s5-a .logos", {s[4]+0.05}); settle("#s5-band", {s[4]+0.2});
        pulse("#s5-l1", {k["normi2"]}, 1.1); pulse("#s5-l2", {k["formmy"]}, 1.1); pulse("#s5-l3", {k["denik"]}, 1.1); bandPulse("#s5-band", {k["flota"]}, 1.08);
        swap("#s5-a", "#s5-b", {swaps[4]});
        settle("#s5-h", {swaps[4]+0.3}); settle("#s5-brand", {swaps[4]+0.45}); settle("#s5-url", {swaps[4]+0.6});
        pulse("#s5-h", {k["agentes"]}, 1.1); pulse("#s5-brand", {k["easy5"]}, 1.06);
        flip({k["entra"]});
        tl.to("#s5-url", {{ scale: 1.1, rotation: -3, duration: 0.18, ease: "power2.out", repeat: 1, yoyo: true, transformOrigin: "50% 50%" }}, {k["cloud"]});

        wipe("#w1", {cuts[0]-0.3}); wipe("#w2", {cuts[1]-0.3}); wipe("#w3", {cuts[2]-0.3}); wipe("#w4", {cuts[3]-0.3});
        window.__timelines["main"] = tl;
      }})();
    </script>
  </body>
</html>
'''
open("index.html","w").write(head+js)
open("cues.env","w").write(f'CUTS=({" ".join(map(str,cuts))})\nSWAPS=({" ".join(map(str,swaps))})\nPULSES=({" ".join(map(str,pulses))})\nHITS=({" ".join(map(str,hits))})\nBRILLO_T={k["entra"]:.2f}\nTOTAL={total}\n')
print(f"{VDIR}: total {total}s · cortes {cuts} · swaps {swaps}")
