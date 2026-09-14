# Genera las 5 líneas con una voz de ElevenLabs y las deja recortadas en wav 48k.
import json, os, subprocess, sys, urllib.request
KEY=os.environ["ELEVEN_KEY"]; prefix, name = sys.argv[1], sys.argv[2]
req=urllib.request.Request("https://api.elevenlabs.io/v2/voices?page_size=100",headers={"xi-api-key":KEY})
voices=json.loads(urllib.request.urlopen(req).read().decode("utf8","replace").replace("\n"," ").replace("\r"," "), strict=False)["voices"]
vid=[v["voice_id"] for v in voices if v["voice_id"].startswith(prefix)][0]
os.makedirs(f"voces/{name}",exist_ok=True)
# loudnorm -19 LUFS: todas las voces al mismo nivel; la cama se agacha contra la voz.
only=[int(x) for x in sys.argv[3].split(",")] if len(sys.argv)>3 else None
for i,line in enumerate(open("lineas.txt",encoding="utf8").read().strip().split("\n"),1):
    if only and i not in only: continue
    body=json.dumps({"text":line,"model_id":"eleven_multilingual_v2","voice_settings":{"stability":0.6,"similarity_boost":0.8,"style":0.15,"speed":1.08}}).encode()
    r=urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128",data=body,headers={"xi-api-key":KEY,"Content-Type":"application/json"})
    open(f"voces/{name}/0{i}.mp3","wb").write(urllib.request.urlopen(r).read())
    subprocess.run(["ffmpeg","-v","error","-y","-i",f"voces/{name}/0{i}.mp3","-ar","48000","-af","silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-19:TP=-1.5:LRA=9,apad=pad_dur=0.15",f"voces/{name}/0{i}.wav"],check=True)
    d=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f"voces/{name}/0{i}.wav"],capture_output=True,text=True).stdout.strip()
    print(name,i,d)
