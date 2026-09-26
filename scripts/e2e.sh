#!/bin/zsh
# Teste ponta a ponta pela API (o servidor precisa estar rodando: npm run dev).
# 1) aponta input_dir para samples/, configura split/texto nos hooks, renderiza;
# 2) restaura config/components/connections;
# 3) verifica: 6/6 OK, áudio == vídeo em toda saída, sem .tmp, manifest com 6 linhas.
set -e
setopt +o nomatch 2>/dev/null || true
cd "$(dirname "$0")/.."
PORT=${PORT:-4310}; API=http://localhost:$PORT/api
FP=${FFPROBE:-/opt/homebrew/bin/ffprobe}
[ -d samples/hooks ] || ./scripts/make-samples.sh
BK=$(mktemp -d); cp config.json components.csv connections.json "$BK"/ 2>/dev/null || true
restore() { cp "$BK"/config.json config.json; cp "$BK"/components.csv components.csv 2>/dev/null || true; cp "$BK"/connections.json connections.json 2>/dev/null || true; curl -s -X POST $API/scan >/dev/null; rm -rf output/e2e-leva; }
trap restore EXIT
python3 - <<'PY'
import json; p='config.json'; d=json.load(open(p)); d['input_dir']='./samples'
open(p,'w').write(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
PY
: > components.csv; echo '{"cutsHookBody":[],"cutsBodyCta":[]}' > connections.json
curl -sf -X POST $API/scan >/dev/null
python3 - "$API" <<'PY'
import json,sys,urllib.request
api=sys.argv[1]; rows=json.load(urllib.request.urlopen(api+'/components'))['rows']
for r in rows:
    if r['id']=='H01': r.update(layout='imagem_cima', imagem='produto.png', texto_overlay='PARE DE PERDER|DINHEIRO', texto_estilo='tarja', texto_posicao=0.3)
    if r['id']=='H02': r.update(texto_overlay="Texto simples: 100% grátis, 'aspas' & vírgula — uma frase longa o bastante para precisar quebrar em duas ou três linhas", texto_estilo='simples', texto_posicao=0.3)
    if r['id']=='H03': r.update(texto_overlay='SEM ÁUDIO', texto_estilo='tarja')
req=urllib.request.Request(api+'/components',data=json.dumps({'rows':rows}).encode(),headers={'Content-Type':'application/json'},method='PUT')
urllib.request.urlopen(req).read()
PY
R=$(curl -s -X POST $API/render); echo "start: $R"
JOB=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin).get('jobId',''))")
[ -n "$JOB" ] || { echo "FALHOU ao iniciar"; exit 1; }
while true; do
  sleep 3
  ST=$(curl -s "$API/render?id=$JOB")
  PH=$(echo "$ST" | python3 -c "import json,sys; d=json.loads(sys.stdin.read(),strict=False); print(d['phase'],d['done'],d['failed'],d['total'])")
  echo "  $PH"; case "$PH" in done*|error*|cancelled*) break;; esac
done
echo "$ST" | python3 -c "import json,sys; d=json.loads(sys.stdin.read(),strict=False); print('\n'.join(d['log'])); print('batch:',d.get('batchId')); sys.exit(0 if d['phase']=='done' and d['failed']==0 else 1)"
B=output/$(echo "$ST" | python3 -c "import json,sys; print(json.loads(sys.stdin.read(),strict=False)['batchId'])")
FAIL=0
for f in $B/*.mp4; do
  read V A <<<"$($FP -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 "$f") $($FP -v error -select_streams a:0 -show_entries stream=duration -of csv=p=0 "$f")"
  D=$(python3 -c "print(abs($V-$A))")
  OK=$(python3 -c "print('ok' if abs($V-$A)<=0.05 else 'DRIFT')")
  echo "  $(basename $f): video=$V audio=$A delta=$D $OK"; [ "$OK" = ok ] || FAIL=1
done
ls $B/*.tmp.mp4 2>/dev/null && { echo "sobrou .tmp"; FAIL=1; }
N=$(($(wc -l < $B/manifest.csv)-1)); echo "  manifest: $N linhas"; [ "$N" = 6 ] || FAIL=1
[ -f $B/status.json ] && echo "  status.json: $(python3 -c "import json;d=json.load(open('$B/status.json'));print(d['phase'],d['done'],'/',d['total'])")" || { echo "  sem status.json"; FAIL=1; }
echo "--- leva: renderizar duas vezes sem mudar nada → 2ª pula tudo, nomes idênticos ---"
rm -rf output/e2e-leva
run_leva() {
  R=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"leva":"e2e-leva"}' $API/render)
  J=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin).get('jobId',''))")
  if [ -z "$J" ]; then echo "FALHOU ao iniciar (leva): $R" >&2; exit 1; fi
  while true; do
    sleep 2
    ST=$(curl -s "$API/render?id=$J")
    PH=$(echo "$ST" | python3 -c "import json,sys; d=json.loads(sys.stdin.read(),strict=False); print(d['phase'])")
    case "$PH" in done*|error*|cancelled*) break;; esac
  done
  echo "$ST"
}

ST1=$(run_leva)
echo "$ST1" | python3 -c "
import json,sys
d=json.loads(sys.stdin.read(),strict=False)
print('  1ª leva: done=%d pulados=%d falhas=%d'%(d['done'],d.get('skipped',0),d['failed']))
assert d['phase']=='done' and d['failed']==0 and d['done']==6 and d.get('skipped',0)==0, 'esperava 6 done / 0 pulados na 1ª'
"
FILES1=$(ls output/e2e-leva/*.mp4 | xargs -n1 basename | sort)

ST2=$(run_leva)
echo "$ST2" | python3 -c "
import json,sys
d=json.loads(sys.stdin.read(),strict=False)
print('  2ª leva (sem mudar nada): done=%d pulados=%d falhas=%d'%(d['done'],d.get('skipped',0),d['failed']))
assert d['done']==0 and d.get('skipped',0)==6 and d['failed']==0, 'esperava 0 done / 6 pulados na 2ª'
"
FILES2=$(ls output/e2e-leva/*.mp4 | xargs -n1 basename | sort)
if [ "$FILES1" = "$FILES2" ]; then echo "  nomes idênticos ✓"; else echo "  NOMES DIFERENTES entre 1ª e 2ª"; FAIL=1; fi

echo "--- leva: mudar o texto do H01 → só as combinações do H01 ganham arquivo novo ---"
python3 - "$API" <<'PY'
import json,sys,urllib.request
api=sys.argv[1]; rows=json.load(urllib.request.urlopen(api+'/components'))['rows']
for r in rows:
    if r['id']=='H01': r['texto_overlay']=r['texto_overlay']+' V2'
req=urllib.request.Request(api+'/components',data=json.dumps({'rows':rows}).encode(),headers={'Content-Type':'application/json'},method='PUT')
urllib.request.urlopen(req).read()
PY
ST3=$(run_leva)
echo "$ST3" | python3 -c "
import json,sys
d=json.loads(sys.stdin.read(),strict=False)
print('  3ª leva (H01 mudou): done=%d pulados=%d falhas=%d'%(d['done'],d.get('skipped',0),d['failed']))
assert d['done']==2 and d.get('skipped',0)==4 and d['failed']==0, 'esperava 2 done (H01xB01,H01xB02) / 4 pulados'
"
N3=$(ls output/e2e-leva/*.mp4 | wc -l | tr -d ' ')
echo "  arquivos em output/e2e-leva agora: $N3 (6 antigos + 2 novos do H01, histórico preservado)"
[ "$N3" = 8 ] || { echo "  esperava 8 arquivos (histórico preservado)"; FAIL=1; }

echo "--- manifest da leva: texto e modo do hook por combinação ---"
python3 - <<'PY'
import csv
with open('output/e2e-leva/manifest.csv') as f:
    rows = list(csv.DictReader(f))
print('  linhas no manifest.csv:', len(rows))
for r in rows:
    print('   ', r['arquivo'], '| hook_modo=%s hook_texto=%r body_texto=%r status=%s' % (
        r['hook_modo'], r['hook_texto'][:30], r['body_texto'][:30], r['status']))
PY
rm -rf output/e2e-leva

echo "--- cancelamento: inicia outro render e cancela na hora ---"
R2=$(curl -s -X POST $API/render); J2=$(echo "$R2" | python3 -c "import json,sys; print(json.load(sys.stdin).get('jobId',''))")
sleep 2; curl -s -X DELETE "$API/render?id=$J2" >/dev/null; T0=$(date +%s)
until curl -s "$API/render?id=$J2" | python3 -c "import sys,json; d=json.loads(sys.stdin.read(),strict=False); sys.exit(0 if d['phase'] in ('cancelled','done','error') else 1)"; do sleep 1; [ $(( $(date +%s)-T0 )) -gt 60 ] && break; done
CT=$(( $(date +%s)-T0 )); echo "  cancel → estado final em ${CT}s, ffmpeg vivos: $(pgrep -c ffmpeg || echo 0)"
[ $CT -le 5 ] || { echo "  cancel demorou"; FAIL=1; }
B2=output/$(curl -s "$API/render?id=$J2" | python3 -c "import sys,json; print(json.loads(sys.stdin.read(),strict=False).get('batchId',''))"); [ -d "$B2" ] && rm -rf "$B2"
echo "--- reanexar: GET /api/render sem id devolve o último job ---"
curl -s "$API/render" | python3 -c "import sys,json; d=json.loads(sys.stdin.read(),strict=False); print('  último job:',d['id'],d['phase'])"
[ $FAIL = 0 ] && echo "E2E OK" || { echo "E2E FALHOU"; exit 1; }
