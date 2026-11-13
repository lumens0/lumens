"""
Gera as fontes que o site serve (src/fontes/*-600-800.woff2 e *-400-700.woff2) a partir dos
originais variáveis do Google Fonts (src/fontes/*-var.woff2). SCRUM-59.

O recorte não muda nada do que aparece na tela:
- tira o eixo de largura (`wdth`), fixo em 100, que é o que o site usa (nenhum `font-stretch`);
- na Bricolage, deixa só os pesos dos títulos, de 600 a 800. O eixo de tamanho óptico fica inteiro.

Os originais continuam no repositório: são a fonte deste recorte e dos TTF do card da pauta.

Rodar de novo quando trocar um original ou quando um título passar a usar peso fora de 600 a 800:
    pip install fonttools brotli
    python3 apps/site/scripts/recortar-fontes.py
"""
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONTES = Path(__file__).resolve().parent.parent / 'src/fontes'

RECORTES = [
    ('bricolage-grotesque-latin-var.woff2', 'bricolage-grotesque-latin-600-800.woff2',
     {'wght': (600, 800), 'wdth': 100}),
    ('instrument-sans-latin-var.woff2', 'instrument-sans-latin-400-700.woff2', {'wdth': 100}),
]

for origem, destino, limites in RECORTES:
    fonte = instancer.instantiateVariableFont(TTFont(FONTES / origem), limites, updateFontNames=False)
    fonte.flavor = 'woff2'
    fonte.save(FONTES / destino)
    antes, depois = (FONTES / origem).stat().st_size, (FONTES / destino).stat().st_size
    print(f'{destino}: {antes // 1024} KB -> {depois // 1024} KB')
