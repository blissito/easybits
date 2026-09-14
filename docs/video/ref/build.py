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
    for w,t in ws:
        if w.startswith(key): return t
    print(f"  ! no encontré «{key}», uso {default:.2f}"); return default

N=6
D=[dur(f"{VDIR}/0{i}.wav") for i in range(1,N+1)]
LEAD=[0.9,0.4,0.4,0.4,0.4,0.4]; TAIL=[0.3,0.3,0.3,0.3,0.3,1.6]
start=[0.0]; 
for i in range(N):
    start.append(start[i]+LEAD[i]+D[i]+TAIL[i])
voice=[start[i]+LEAD[i] for i in range(N)]
total=round(start[N],3); cuts=[round(x,3) for x in start[1:N]]
W=[words(i) for i in range(1,N+1)]
def t(i,key,default): return round(voice[i]+find(W[i],key,default),2)

# palabras clave por escena (default = proporción de la línea, por si whisper no la oye)
def has(i,key): return any(w.startswith(key) for w,_ in W[i])
k = dict(
 agua=t(0,"agua",0.15*D[0]), pregunta=t(0,"pregunta",0.28*D[0]), normi=t(0,"normi",0.5*D[0]), asistente=t(0,"asistente",0.6*D[0]),
 consola=t(0,"consola",0.7*D[0]), bitacora=t(0,"bitacora",0.78*D[0]), vigencias=t(0,"vigencias",0.86*D[0]), dato=t(0,"dato",0.97*D[0]),
 tanque=t(1,"tanque",0.02), doce=t(1,"2",0.25*D[1]) if has(1,"2") else t(1,"dos",0.25*D[1]), saca=t(1,"saca",0.5*D[1]), veeder=t(1,"consola",0.65*D[1]), memoria=t(1,"memoria",0.92*D[1]),
 asea=t(2,"pide",0.1*D[2]), derrame=t(2,"derrame",0.3*D[2]), aviso=t(2,"aviso",0.62*D[2]), formal=t(2,"formal",0.75*D[2]),
 tres=t(2,"3",0.85*D[2]) if has(2,"3") else t(2,"tres",0.85*D[2]), habiles=t(2,"habil",0.93*D[2]),
 dictale=t(3,"dicta",0.02), treinta=t(3,"32",0.25*D[3]) if has(3,"32") else t(3,"treinta",0.25*D[3]), nota=t(3,"nota",0.4*D[3]),
 deja=t(3,"deja",0.55*D[3]), revisas=t(3,"revisas",0.75*D[3]), foto=t(3,"foto",0.85*D[3]), firmas=t(3,"firmas",0.95*D[3]),
 ia=t(4,"inteligencia",0.05*D[4]), pero=t(4,"pero",0.3*D[4]), sola=t(4,"sola",0.4*D[4]), control=t(4,"control",0.5*D[4]), tanques=t(4,"tanques",0.66*D[4]), papeles=t(4,"bitacora",0.74*D[4]), norma=t(4,"norma",0.82*D[4]), horas=t(4,"24",0.9*D[4]) if has(4,"24") else t(4,"veinticuatro",0.9*D[4]),
 prepara=t(5,"prepara",0.1*D[5]), firmas2=t(5,"firmas",0.3*D[5]), escrib=t(5,"escrib",0.5*D[5]), wa=t(5,"whats",0.68*D[5]), normi2=t(5,"normi",0.9*D[5]),
)
swaps=[round(k["normi"]-0.45,2), round(k["saca"]-0.45,2), round(k["aviso"]-0.5,2), round(k["deja"]-0.45,2), round(k["control"]-0.5,2), round(k["escrib"]-0.4,2)]
pulses=[k["asistente"],k["consola"],k["bitacora"],k["vigencias"],k["doce"],k["tres"],k["revisas"],k["foto"],k["firmas"],k["tanques"],k["papeles"],k["norma"]]
hits=[k["control"],k["horas"],k["prepara"]]
s=[round(x,3) for x in start]; sd=[round(LEAD[i]+D[i]+TAIL[i],3) for i in range(N)]

html=open("index.html").read()
head=html.split("    <script>\n      (function () {")[0]
# HTML: tiempos de escenas, wipes, voz, duración total
head=re.sub(r'data-duration="[\d.]+" data-width="1080"',f'data-duration="{total}" data-width="1080"',head)
head=re.sub(r'id="fondo" data-start="0" data-duration="[\d.]+"',f'id="fondo" data-start="0" data-duration="{total}"',head)
for i in range(N):
    head=re.sub(rf'id="esc-{i+1}" data-start="[\d.]+" data-duration="[\d.]+"',f'id="esc-{i+1}" data-start="{s[i]}" data-duration="{sd[i]}"',head)
    head=re.sub(rf'id="voz-0{i+1}" src="[^"]+" data-start="[\d.]+"\s+data-duration="[\d.]+"',f'id="voz-0{i+1}" src="{VDIR}/0{i+1}.wav" data-start="{round(voice[i],3)}" data-duration="{round(D[i],3)}"',head)
for j,c in enumerate(cuts):
    head=re.sub(rf'id="w{j+1}" data-start="[\d.]+"',f'id="w{j+1}" data-start="{round(c-0.3,3)}"',head)
head=re.sub(r'(<!-- ===== Escena \d[^(]*)\([^)]*\)',lambda m:m.group(1)+"(t según build.py)",head)

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
        function chip(sel, t) {{ tl.to(sel, {{ backgroundColor: "#F5A800", color: "#1B2430", duration: 0.12 }}, t); pulse(sel, t); }}

        tl.to("#grid", {{ x: 60, y: 60, duration: 4, ease: "none", repeat: {reps} }}, 0);
        tl.to("#blob-a", {{ scale: 1.25, x: 80, duration: 3.2, ease: "sine.inOut", repeat: {reps+2}, yoyo: true }}, 0);
        tl.to("#blob-b", {{ scale: 1.2, y: -80, duration: 3.9, ease: "sine.inOut", repeat: {reps}, yoyo: true }}, 0.7);

        // Escena 1 · voz {voice[0]:.2f}
        settle("#s1-a .kicker", 0.05, 0.4);
        tl.from("#s1-q", {{ y: 40, rotation: -3, duration: 0.45, ease: "back.out(1.6)", transformOrigin: "50% 100%" }}, 0.12);
        settle("#s1-a .foot", 0.3);
        pulse("#s1-q", {k["agua"]}, 1.06); pulse("#s1-a .kicker", {k["pregunta"]}, 1.06);
        swap("#s1-a", "#s1-b", {swaps[0]});
        settle("#s1-wm", {swaps[0]+0.3}); pulse("#s1-wm", {k["normi"]}, 1.08); pulse("#s1-b .h", {k["asistente"]}, 1.08);
        chip("#s1-c1", {k["consola"]}); chip("#s1-c2", {k["bitacora"]}); chip("#s1-c3", {k["vigencias"]});
        pulse("#s1-b .chips", {k["dato"]}, 1.05);

        // Escena 2 · voz {voice[1]:.2f}
        settle("#s2-a .kicker", {s[1]+0.05}, 0.4); settle("#s2-num", {s[1]+0.1}); settle("#s2-a .h", {s[1]+0.25});
        pulse("#s2-a .kicker", {k["tanque"]}, 1.06); pulse("#s2-num", {k["doce"]}, 1.12);
        swap("#s2-a", "#s2-b", {swaps[1]});
        tl.from("#s2-phone", {{ y: 80, rotation: -4, duration: 0.5, ease: "power3.out", transformOrigin: "50% 100%" }}, {swaps[1]+0.2});
        settle("#s2-b .h", {swaps[1]+0.4}); pulse("#s2-phone", {k["veeder"]}, 1.03); pulse("#s2-b .h", {k["memoria"]}, 1.06);

        // Escena 3 · voz {voice[2]:.2f}
        settle("#s3-a .kicker", {s[2]+0.04}, 0.4);
        tl.from("#s3-q", {{ y: 40, rotation: 3, duration: 0.45, ease: "back.out(1.6)", transformOrigin: "50% 100%" }}, {s[2]+0.12});
        pulse("#s3-q", {k["asea"]}, 1.05); pulse("#s3-q", {k["derrame"]}, 1.06);
        swap("#s3-a", "#s3-b", {swaps[2]});
        settle("#s3-num", {swaps[2]+0.3}); settle("#s3-b .h", {swaps[2]+0.45}); settle("#s3-b .foot", {swaps[2]+0.6});
        pulse("#s3-b .kicker", {k["aviso"]}, 1.06); pulse("#s3-b .kicker", {k["formal"]}, 1.06); pulse("#s3-num", {k["tres"]}, 1.12); pulse("#s3-b .h", {k["habiles"]}, 1.06);

        // Escena 4 · voz {voice[3]:.2f}
        settle("#s4-a .kicker", {s[3]+0.04}, 0.4);
        tl.from("#s4-q", {{ y: 40, rotation: -3, duration: 0.45, ease: "back.out(1.6)", transformOrigin: "50% 100%" }}, {s[3]+0.12});
        pulse("#s4-a .kicker", {k["dictale"]}, 1.06); pulse("#s4-q", {k["treinta"]}, 1.05); pulse("#s4-q", {k["nota"]}, 1.05);
        swap("#s4-a", "#s4-b", {swaps[3]});
        tl.from("#s4-phone", {{ y: 80, rotation: 4, duration: 0.5, ease: "power3.out", transformOrigin: "50% 100%" }}, {swaps[3]+0.2});
        settle("#s4-b .chips", {swaps[3]+0.4});
        chip("#s4-c1", {k["revisas"]}); chip("#s4-c2", {k["foto"]}); chip("#s4-c3", {k["firmas"]});

        // Escena 5 · voz {voice[4]:.2f}
        settle("#s5-a .kicker", {s[4]+0.04}, 0.4); settle("#s5-h", {s[4]+0.14});
        pulse("#s5-a .kicker", {k["ia"]}, 1.08); pulse("#s5-h", {k["sola"]}, 1.08);
        swap("#s5-a", "#s5-b", {swaps[4]});
        settle("#s5-ctl", {swaps[4]+0.3}); settle("#s5-b .chips", {swaps[4]+0.45}); settle("#s5-24", {swaps[4]+0.6});
        pulse("#s5-ctl", {k["control"]}, 1.1);
        chip("#s5-c1", {k["tanques"]}); chip("#s5-c2", {k["papeles"]}); chip("#s5-c3", {k["norma"]});
        pulse("#s5-24", {k["horas"]}, 1.15);

        // Escena 6 · voz {voice[5]:.2f}
        settle("#s6-a .kicker", {s[5]+0.04}, 0.4); settle("#s6-h", {s[5]+0.14});
        pulse("#s6-h", {k["prepara"]}, 1.06); pulse("#s6-h", {k["firmas2"]}, 1.06);
        swap("#s6-a", "#s6-b", {swaps[5]});
        tl.from("#s6-wa", {{ scale: 0.85, rotation: -3, duration: 0.4, ease: "back.out(2)", transformOrigin: "50% 50%" }}, {swaps[5]+0.2});
        pulse("#s6-wa", {k["wa"]}, 1.06); settle("#s6-wm", {swaps[5]+1.2}); settle("#s6-b .foot", {swaps[5]+1.4}); pulse("#s6-wm", {k["normi2"]}, 1.1);

        wipe("#w1", {cuts[0]-0.3}); wipe("#w2", {cuts[1]-0.3}); wipe("#w3", {cuts[2]-0.3}); wipe("#w4", {cuts[3]-0.3}); wipe("#w5", {cuts[4]-0.3});
        window.__timelines["main"] = tl;
      }})();
    </script>
  </body>
</html>
'''
open("index.html","w").write(head+js)
open("cues.env","w").write(f'CUTS=({" ".join(map(str,cuts))})\nSWAPS=({" ".join(map(str,swaps))})\nPULSES=({" ".join(map(str,pulses))})\nHITS=({" ".join(map(str,hits))})\nBRILLO_T={k['normi2']-0.3:.2f}\nTOTAL={total}\n')
print(f"{VDIR}: total {total}s · cortes {cuts}")
