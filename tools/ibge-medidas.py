# Extrai a Tabela de Medidas Referidas para os Alimentos Consumidos no Brasil (IBGE, POF 2008-2009, 2011) do PDF oficial
# para um TSV versionado (tools/ibge-medidas-referidas.tsv), lido por tools/build-foods.py.
#
# Fonte: IBGE, Pesquisa de Orçamentos Familiares 2008-2009, "Tabela de medidas referidas para os alimentos consumidos
# no Brasil", Rio de Janeiro, 2011. https://biblioteca.ibge.gov.br/visualizacao/livros/liv50000.pdf
# (sha256 do PDF usado: 317ace59e53e25f3fc4913c5f552adf181bf001e6272edb5ae7a46804aa360b0)
#
# Uso: pdftotext -layout liv50000.pdf liv50000.txt && python3 tools/ibge-medidas.py liv50000.txt
#
# Cada linha da tabela tem: código e descrição do alimento, código e descrição do preparo, código e descrição da medida
# referida, código e descrição da medida padrão, quantidade (g ou mL), código da fonte de referência (Quadro 3 do PDF)
# e a descrição do alimento na referência. As medidas "Grama" e "Quilo" ficam de fora (já são cobertas por gramas).
import os, re, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, 'tools', 'ibge-medidas-referidas.tsv')
ROW = re.compile(r'^(\d{7}) (.+?)\s+(\d{1,2}) (.+?)\s{2,}(\d{1,3}) (.+?)\s{2,}(\d{1,3}) (.+?)\s{2,}([\d.]*\d(?:,\d+)?)\s+(\d{1,2}) (.*\S)\s*$')
COLUMNS = ['codigo', 'alimento', 'preparo_cod', 'preparo', 'medida_cod', 'medida', 'padrao_cod', 'gramas', 'fonte', 'referencia']


def main(src):
    rows, misses = [], 0
    for line in open(src, encoding='utf-8'):
        line = line.rstrip('\n')
        if not re.match(r'^\d{7} ', line):
            continue
        m = ROW.match(line)
        if not m:
            misses += 1
            continue
        code, food, pc, prep, mc, meas, sc, _std, qty, fonte, ref = m.groups()
        if meas.strip() in ('Grama', 'Quilo'):
            continue
        grams = qty.replace('.', '').replace(',', '.')
        rows.append([code, food.strip(), pc, prep.strip(), mc, meas.strip(), sc, grams, fonte, ref.strip()])
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('\t'.join(COLUMNS) + '\n')
        for r in rows:
            fh.write('\t'.join(r) + '\n')
    print('linhas', len(rows), 'não lidas', misses)


if __name__ == '__main__':
    main(sys.argv[1])
