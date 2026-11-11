"""
Gera src/componentes/mapa/campus-osm.ts com o desenho do Campus A. C. Simões tirado do
OpenStreetMap: o contorno do campus, os prédios e os caminhos, já projetados em metros.

Rodar de novo quando o mapa do campus mudar no OSM:  python3 apps/site/scripts/campus-osm.py

Dados © colaboradores do OpenStreetMap, sob a licença ODbL (o site mostra o crédito no mapa).
"""
import math
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

CAMPUS = 37060474  # way "Universidade Federal de Alagoas" no OSM
BBOX = '-35.7840,-9.5610,-35.7680,-9.5470'
SAIDA = Path(__file__).resolve().parent.parent / 'src/componentes/mapa/campus-osm.ts'
CAMINHOS = {'footway', 'path', 'pedestrian', 'service', 'residential', 'tertiary', 'secondary',
            'unclassified', 'living_street', 'steps'}

pedido = urllib.request.Request(
    f'https://api.openstreetmap.org/api/0.6/map?bbox={BBOX}',
    headers={'User-Agent': 'lumens-mapa/0.1'},
)
raiz = ET.fromstring(urllib.request.urlopen(pedido, timeout=90).read())
nos = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in raiz.iter('node')}
vias = {w.get('id'): w for w in raiz.iter('way')}


def tags(w):
    return {t.get('k'): t.get('v') for t in w.findall('tag')}


def pontos(w):
    return [nos[nd.get('ref')] for nd in w.findall('nd') if nd.get('ref') in nos]


contorno = pontos(vias[str(CAMPUS)])
lat0 = sum(p[0] for p in contorno) / len(contorno)
lon0 = sum(p[1] for p in contorno) / len(contorno)
kx = 111320 * math.cos(math.radians(lat0))
ky = 110540


def metros(p):
    return ((p[1] - lon0) * kx, (lat0 - p[0]) * ky)


def dentro(p, poligono):
    x, y = p
    sim = False
    for (x1, y1), (x2, y2) in zip(poligono, poligono[1:] + poligono[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            sim = not sim
    return sim


borda = [metros(p) for p in contorno]
xs = [x for x, _ in borda]
ys = [y for _, y in borda]
MARGEM = 40
dx, dy = MARGEM - min(xs), MARGEM - min(ys)
largura = round(max(xs) - min(xs) + 2 * MARGEM)
altura = round(max(ys) - min(ys) + 2 * MARGEM)


def plano(p):
    x, y = metros(p)
    return (round(x + dx, 1), round(y + dy, 1))


def caminho(pts, fechado):
    d = 'M' + 'L'.join(f'{x:g} {y:g}' for x, y in pts)
    return d + 'Z' if fechado else d


predios, linhas = [], []
for id_, w in vias.items():
    t = tags(w)
    pts = pontos(w)
    if len(pts) < 2:
        continue
    em_metros = [metros(p) for p in pts]
    if 'building' in t and len(pts) >= 4:
        cx = sum(x for x, _ in em_metros) / len(em_metros)
        cy = sum(y for _, y in em_metros) / len(em_metros)
        if not dentro((cx, cy), borda):
            continue
        pl = [plano(p) for p in pts[:-1]]
        px = [x for x, _ in pl]
        py = [y for _, y in pl]
        caixa = [min(px), min(py), round(max(px) - min(px), 1), round(max(py) - min(py), 1)]
        predios.append((int(id_), t.get('name', ''), caminho(pl, True), caixa))
    elif t.get('highway') in CAMINHOS and any(dentro(p, borda) for p in em_metros):
        linhas.append(caminho([plano(p) for p in pts], False))

predios.sort()
linhas.sort()
saida = [
    '// Gerado por apps/site/scripts/campus-osm.py: não editar à mão.',
    '// Dados © colaboradores do OpenStreetMap (ODbL). Unidade: metros, com o norte para cima.',
    '',
    f'export const LARGURA_DO_CAMPUS = {largura};',
    f'export const ALTURA_DO_CAMPUS = {altura};',
    '',
    f"export const CONTORNO = '{caminho([plano(p) for p in contorno[:-1]], True)}';",
    '',
    'export const CAMINHOS: readonly string[] = [',
    *[f"  '{d}'," for d in linhas],
    '];',
    '',
    '/** `[id do OSM, nome, contorno, caixa [x, y, largura, altura]]`. */',
    'export const PREDIOS_OSM: readonly (readonly [number, string, string, readonly number[]])[] = [',
    *[f"  [{i}, {n!r}, '{d}', [{', '.join(f'{v:g}' for v in c)}]]," for i, n, d, c in predios],
    '];',
    '',
]
SAIDA.write_text('\n'.join(saida), encoding='utf-8')
print(f'{len(predios)} prédios, {len(linhas)} caminhos, {largura} × {altura} m -> {SAIDA}')
