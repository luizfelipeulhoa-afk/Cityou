# Gera shared/game/foods-base.js e shared/game/foods-portions.js a partir das fontes oficiais.
# Uso: python3 tools/build-foods.py <pasta-de-trabalho>
#   <pasta-de-trabalho> contém: foods-final.json, e a tradução dos nomes USDA (tools/traducao-usda-pt.json, ids -> nome em português),
#   usda/sr/FoodData_Central_sr_legacy_food_csv_2018-04/ e corrigido/fjson/<arquivo Foundation>.json
import json, csv, re, collections, os, sys, unicodedata

SCRATCH = sys.argv[1] if len(sys.argv) > 1 else '.'
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR_DIR = f'{SCRATCH}/usda/sr/FoodData_Central_sr_legacy_food_csv_2018-04'
FND_JSON = f'{SCRATCH}/corrigido/fjson/FoodData_Central_foundation_food_json_2026-10-29.json'
OUT_BASE = f'{REPO}/shared/game/foods-base.js'
OUT_PORT = f'{REPO}/shared/game/foods-portions.js'

HEADER_BASE = """// Base de alimentos da aba Alimentação. Valores por 100 g, gerados a partir de três fontes oficiais:
//   taco      TACO, Tabela Brasileira de Composição de Alimentos, 4ª edição (Unicamp). Nomes em português.
//   usda-fnd  USDA FoodData Central, Foundation Foods (out/2026). Só itens com energia, proteína, gordura e carboidrato.
//   usda-sr   USDA FoodData Central, SR Legacy (abr/2018). Só itens com energia, proteína, gordura e carboidrato.
// Nomes das fontes USDA estão traduzidos para o português; o original em inglês fica no último campo.
// Nomes da TACO: os do xlsx oficial, com correções documentadas em tools/build-foods.py (TACO_NAME_FIXES: a linha 540
// vem como "L" e é a Feijoada; grafia do Acordo de 2009; marcas de nota no fim). Óleos, azeites e cachaça entram com
// "NA" = 0 (TACO_ADDED). Leite de vaca integral e desnatado não têm valores na TACO 4ª edição (vêm da USDA).
// Quando o mesmo nome aparece em mais de uma fonte, fica a de prioridade maior (TACO > Foundation > SR Legacy).
// Campos de cada linha: [id, nome, grupo, fonte, referência na fonte, kcal, proteína g, gordura g, carboidrato g, fibra g, nome original em inglês ('' para TACO)].
// Fibra é null quando a fonte não traz o valor. Não editar valores à mão: gerar de novo a partir dos arquivos oficiais.
// Decisão do dono (14/11/2026); ver projeto CityouApp, nutricao/atualizacao-2026-11-14-g-diario.md.
"""

HEADER_PORTIONS = """// Porções em unidades (colher, concha, xícara, unidade, fatia etc.) com o peso em gramas de cada unidade.
// Fontes, nesta ordem:
//   1. IBGE, POF 2008-2009, Tabela de Medidas Referidas para os Alimentos Consumidos no Brasil (2011), para os alimentos
//      da TACO e o leite: medidas caseiras brasileiras, ligadas a mão em tools/medidas-taco-ibge.json. Só entra a medida
//      cuja referência descreve a mesma medida e o mesmo preparo (cozido, frito...) do alimento; colher de chá, de
//      sobremesa e de café entram quando o IBGE as calcula da colher de sopa. Bebidas: o IBGE dá mL, usado como g.
//   2. USDA SR Legacy food_portion.csv e Foundation Foods foodPortions (ovo e banana nanica da TACO usam a unidade da
//      USDA equivalente). Pesos e volumes já são cobertos pela quantidade em gramas e ficam de fora.
// Gerado por tools/build-foods.py. Não editar à mão.
"""

GROUP_PT = {
    'Fruits and Fruit Juices': 'Frutas e derivados',
    'Vegetables and Vegetable Products': 'Verduras, hortaliças e derivados',
    'Beef Products': 'Carnes e derivados (bovina)',
    'Dairy and Egg Products': 'Leite e derivados',
    'Poultry Products': 'Aves e derivados',
    'Baked Products': 'Produtos de padaria e confeitaria',
    'Finfish and Shellfish Products': 'Pescados e frutos do mar',
    'Cereal Grains and Pasta': 'Cereais e massas',
    'Legumes and Legume Products': 'Leguminosas e derivados',
    'Sausages and Luncheon Meats': 'Embutidos e frios',
    'Pork Products': 'Carnes e derivados (suína)',
    'Spices and Herbs': 'Temperos e ervas',
    'Nut and Seed Products': 'Nozes e sementes',
    'Fats and Oils': 'Gorduras e óleos',
    'Restaurant Foods': 'Alimentos de restaurante',
    'Soups, Sauces, and Gravies': 'Sopas, molhos e caldos',
    'Sweets': 'Doces',
    'Fast Foods': 'Fast food',
    'American Indian/Alaska Native Foods': 'Alimentos tradicionais (EUA e Alasca)',
    'Beverages': 'Bebidas (alcoólicas e não alcoólicas)',
    'Meals, Entrees, and Side Dishes': 'Refeições e acompanhamentos',
    'Baby Foods': 'Alimentos infantis',
    'Lamb, Veal, and Game Products': 'Cordeiro, vitela e caça',
    'Snacks': 'Lanches e petiscos',
    'Breakfast Cereals': 'Cereais matinais',
}

# Descrição de porção (normalizada) -> nome da unidade em português. None = descartar (peso ou volume já coberto por gramas).
NOUNS = {
    'serving': 'porção', 'nlea serving': 'porção', 'order': 'porção', 'racc': 'porção',
    'unit': 'unidade', 'item': 'unidade', 'each': 'unidade', 'pepper': 'unidade',
    'medium': 'unidade média', 'large': 'unidade grande', 'small': 'unidade pequena',
    'extra large': 'unidade extra grande', 'egg': 'ovo',
    'tbsp': 'colher de sopa', 'tablespoon': 'colher de sopa',
    'tsp': 'colher de chá', 'teaspoon': 'colher de chá',
    'cup': 'xícara', 'slice': 'fatia', 'slices': 'fatia', 'piece': 'pedaço', 'pieces': 'pedaço',
    'package': 'pacote', 'packet': 'pacote', 'bag': 'saco', 'box': 'caixa',
    'can': 'lata', 'can or bottle': 'lata', 'bottle': 'garrafa', 'jar': 'pote', 'container': 'pote',
    'bar': 'barra', 'stick': 'palito', 'strip': 'tira', 'strips': 'tira',
    'roll': 'pãozinho', 'biscuit': 'biscoito', 'cookie': 'biscoito', 'cookies': 'biscoito',
    'cracker': 'biscoito salgado', 'crackers': 'biscoito salgado', 'pancake': 'panqueca',
    'muffin': 'muffin', 'pie': 'torta', 'cake': 'bolo', 'pizza': 'pizza', 'sandwich': 'sanduíche',
    'tortilla': 'tortilha', 'frankfurter': 'salsicha', 'bagel': 'bagel', 'pastry': 'folhado',
    'steak': 'bife', 'fillet': 'filé', 'roast': 'assado', 'chop': 'costeleta', 'patty': 'hambúrguer',
    'link': 'gomo', 'breast': 'peito', 'thigh': 'coxa', 'drumstick': 'coxinha', 'wing': 'asa',
    'leaf': 'folha', 'head': 'cabeça', 'fruit': 'fruta', 'ear': 'espiga', 'potato': 'batata',
    'bird': 'ave', 'wedge': 'gomo', 'spear': 'talo', 'bunch': 'maço', 'olive': 'azeitona',
}
# Qualificadores que, quando aparecem depois do substantivo, entram no nome da unidade.
QUALIFIERS = {
    'chopped': 'picada', 'sliced': 'fatiada', 'diced': 'em cubos', 'cubes': 'em cubos', 'shredded': 'ralada',
    'mashed': 'amassada', 'halves': 'metades', 'whole': 'inteira', 'crushed': 'triturada',
    'pitted': 'sem caroço', 'thin': 'fina', 'large': 'grande', 'medium': 'média', 'small': 'pequena',
}
DROP_PREFIXES = ('oz', 'lb', 'fl oz', 'cubic inch', 'milliliter', 'quart', 'recipe yield', 'package yield',
                 'package  yield', 'portion, amount', 'ml', 'g', 'gram', 'kg')


def norm(desc):
    d = (desc or '').strip().lower()
    d = re.sub(r'\(.*?\)', '', d)
    d = re.sub(r'^\d+(\.\d+)?\s*', '', d)
    return re.sub(r'\s+', ' ', d).strip(' ,')


def unit_label(desc):
    d = norm(desc)
    if not d:
        return None
    for p in DROP_PREFIXES:
        if d == p or d.startswith(p + ' ') or d.startswith(p + ','):
            return None
    parts = [x.strip() for x in re.split(r',', d) if x.strip()]
    head = parts[0] if parts else d
    # "cup slices", "slice, thin", "piece, cooked" etc: tenta a primeira palavra conhecida
    base = None
    for key in sorted(NOUNS, key=len, reverse=True):
        if head == key or head.startswith(key + ' ') or head.startswith(key + ','):
            base = key
            break
    if base is None:
        return None
    label = NOUNS[base]
    rest = head[len(base):].strip() if head != base else ''
    quals = []
    for word in (rest.split() + parts[1:]):
        w = word.strip(' ,')
        if w in QUALIFIERS and QUALIFIERS[w] not in quals and not label.endswith(QUALIFIERS[w]):
            quals.append(QUALIFIERS[w])
    if quals and base in ('cup', 'slice', 'slices'):
        label = f"{label} {quals[0]}"
    return label


# Medidas por unidade que a TACO não traz (a TACO 4ª ed. não tem tabela de medidas caseiras no arquivo).
# Usam a porção da USDA SR de item equivalente; a fonte fica registrada no cabeçalho de foods-portions.js.
TACO_PORTION_LINKS = {
    'taco-489': 'usda-sr-171287',  # Ovo de galinha, inteiro, cru  <- Egg, whole, raw, fresh
    'taco-488': 'usda-sr-173424',  # Ovo de galinha, inteiro, cozido  <- Egg, whole, cooked, hard-boiled
    'taco-490': 'usda-sr-173423',  # Ovo de galinha, inteiro, frito  <- Egg, whole, cooked, fried
    'taco-486': 'usda-sr-172183',  # Ovo de galinha, clara  <- Egg, white, raw, fresh
    'taco-487': 'usda-sr-172184',  # Ovo de galinha, gema  <- Egg, yolk, raw, fresh
    'taco-485': 'usda-sr-172191',  # Ovo de codorna, inteiro, cru  <- Egg, quail, whole, fresh, raw
    'taco-179': 'usda-sr-173944',  # Banana, nanica, crua  <- Bananas, raw
}


def add_portion(bucket, label, grams, amount):
    if label is None or grams is None or grams <= 0:
        return
    amount = amount or 1.0
    per_unit = round(grams / amount, 1)
    if per_unit <= 0 or per_unit > 3000:
        return
    if label not in [l for l, _ in bucket]:
        bucket.append([label, per_unit])


# Palavras inglesas que sobraram nos nomes traduzidos da USDA (só minúsculas: marcas em maiúsculas ficam como estão).
POLISH = [
    (r'\bwith\b', 'com'), (r'\band\b', 'e'), (r'\bwithout\b', 'sem'), (r'\bfrom\b', 'de'),
    (r'\braw\b', 'cru'), (r'\bcooked\b', 'cozido'), (r'\bfresh\b', 'fresco'), (r'\bdried\b', 'seco'),
    (r'\broasted\b', 'assado'), (r'\bbaked\b', 'assado'), (r'\bboiled\b', 'cozido em água'), (r'\bfried\b', 'frito'),
    (r'\bbroiled\b', 'grelhado'), (r'\bcanned\b', 'enlatado'), (r'\bfrozen\b', 'congelado'), (r'\bwhole\b', 'integral'),
    (r'\bunsalted\b', 'sem sal'), (r'\bsalt\b', 'sal'), (r'\bsweetened\b', 'adoçado'), (r'\bunsweetened\b', 'sem açúcar'),
    (r'\bfilled\b', 'recheado'), (r'\bmixed\b', 'misto'), (r'\bstyle\b', 'estilo'), (r'\bsmall\b', 'pequeno'),
    (r'\blarge\b', 'grande'), (r'\bmedium\b', 'médio'), (r'\bcommercially prepared\b', 'industrializado'),
    (r'\blow carb\b', 'baixo carboidrato'), (r'\bnot further specified\b', 'sem outra especificação'), (r'\bNFS\b', 'sem outra especificação'),
]


def polish(name):
    """Limpa o nome traduzido: palavras inglesas restantes, espaços duplos e vírgula sobrando no fim."""
    # Só o texto fora dos parênteses: as glosas em inglês dentro deles (eye of round, salt pork) ficam como estão.
    parts = re.split(r'(\([^()]*\))', name)
    for i in range(0, len(parts), 2):
        for pattern, word in POLISH:
            parts[i] = re.sub(pattern, word, parts[i])
    name = ''.join(parts)
    name = re.sub(r'\s+', ' ', name).strip()
    return name.rstrip(', ').strip()


# TACO: o xlsx oficial tem um nome quebrado, marcas de nota no fim do nome e grafia anterior ao Acordo de 2009.
TACO_NAME_FIXES = {
    # O xlsx traz "L". Os valores (117 kcal, 8,7 g de proteína, 6,5 g de gordura, 11,6 g de carboidrato) são os da
    # Feijoada da TACO, e a posição (entre "Feijão tropeiro mineiro" e "Frango, com açafrão") é a da ordem alfabética.
    'taco-540': 'Feijoada',
    'taco-447': 'Creme de leite',
}
TACO_SPELLING = [
    (r'\bLingüiça\b', 'Linguiça'), (r'\bPêra\b', 'Pera'), (r'\bGeléia\b', 'Geleia'), (r'\bAtemóia\b', 'Atemoia'),
    (r'\bmingnon\b', 'mignon'), (r'/10minutos\b', ' (10 minutos)'), (r',(?=\S)', ', '), (r'%(?=de\b)', '% '), (r' \d$', ''),
]


def taco_name(food_id, name):
    name = TACO_NAME_FIXES.get(food_id, name)
    for pattern, fix in TACO_SPELLING:
        name = re.sub(pattern, fix, name)
    return re.sub(r'\s+', ' ', name).strip()


# Linhas da TACO que o gerador antigo perdeu porque o xlsx traz "NA" (não se aplica): óleos e azeites são só gordura,
# e a cachaça é álcool. Valores do xlsx oficial (CMVCol taco3), por 100 g; "NA" vira 0.
TACO_ADDED = [
    ('taco-259', 'Azeite, de dendê', 'Gorduras e óleos', 884, 0, 100, 0, 0),
    ('taco-260', 'Azeite, de oliva, extra virgem', 'Gorduras e óleos', 884, 0, 100, 0, 0),
    ('taco-267', 'Óleo, de babaçu', 'Gorduras e óleos', 884, 0, 100, 0, 0),
    ('taco-268', 'Óleo, de canola', 'Gorduras e óleos', 884, 0, 100, 0, 0),
    ('taco-269', 'Óleo, de girassol', 'Gorduras e óleos', 884, 0, 100, 0, 0),
    ('taco-270', 'Óleo, de milho', 'Gorduras e óleos', 884, 0, 100, 0, 0),
    ('taco-271', 'Óleo, de pequi', 'Gorduras e óleos', 884, 0, 100, 0, 0),
    ('taco-272', 'Óleo, de soja', 'Gorduras e óleos', 884, 0, 100, 0, 0),
    ('taco-472', 'Cana, aguardente (cachaça)', 'Bebidas (alcoólicas e não alcoólicas)', 216, 0, 0, 0, 0),
]

# ---- Medidas caseiras do IBGE (tools/ibge-medidas.py gera o TSV; tools/medidas-taco-ibge.json liga cada alimento) ----
IBGE_TSV = os.path.join(REPO, 'tools', 'ibge-medidas-referidas.tsv')
IBGE_MAP = os.path.join(REPO, 'tools', 'medidas-taco-ibge.json')


def plain(s):
    return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower().strip()


# Medida do IBGE -> palavras que precisam aparecer na referência para a medida valer (senão ela foi emprestada de outra).
IBGE_KEYS = {
    'colher de sopa': ['colher de sopa'], 'colher de arroz/servir': ['colher de arroz', 'colher de servir'],
    'concha': ['concha'], 'escumadeira': ['escumadeira'], 'unidade': ['unidade'], 'fatia': ['fatia'], 'pedaco': ['pedaco'],
    'copo americano': ['copo americano'], 'copo medio': ['copo medio'], 'copo grande': ['copo grande'],
    'copo pequeno': ['copo pequeno'], 'copo de requeijao': ['copo de requeijao'], 'xicara de cha': ['xicara de cha'],
    'xicara de cafe': ['xicara de cafe'], 'prato fundo': ['prato fundo'], 'prato raso': ['prato raso'], 'pires': ['pires'],
    'bola': ['bola'], 'lata': ['lata'], 'garrafa': ['garrafa'], 'caixinha': ['caixinha'], 'pote': ['pote'],
    'pacote': ['pacote'], 'file': ['file'], 'bife': ['bife'], 'posta': ['posta'], 'espiga': ['espiga'],
    'folha': ['folha'], 'ramo': ['ramo'], 'dente': ['dente'], 'copo de cafezinho': ['copo de cafezinho'],
    'copo tulipa': ['copo tulipa'], 'taca': ['taca'], 'tablete': ['tablete'], 'barra': ['barra'], 'sache': ['sache'],
    'gomo': ['gomo'], 'rodela': ['rodela'], 'cubo': ['cubo'], 'tira': ['tira'], 'pegador': ['pegador'],
}
IBGE_FRACTIONS = {'colher de cha': '1/4 colher de sopa', 'colher de sobremesa': '1/2 colher de sopa',
                  'colher de cafe': '1/8 colher de sopa'}
STATE_WORDS = {
    'cru': 1, 'crua': 1, 'crus': 1, 'cruas': 1, 'cozido': 2, 'cozida': 2, 'cozidos': 2, 'cozidas': 2,
    'grelhado': 3, 'grelhada': 3, 'assado': 4, 'assada': 4, 'assados': 4, 'assadas': 4, 'frito': 5, 'frita': 5,
    'fritos': 5, 'fritas': 5, 'milanesa': 6, 'empanado': 6, 'empanada': 6, 'refogado': 7, 'refogada': 7,
    'ensopado': 13, 'ensopada': 13, 'mexido': 16, 'mexida': 16,
}
PREP_ORDER = {1: [1, 99], 2: [2, 99], 3: [3, 99], 4: [4, 99], 5: [5, 99], 6: [6, 5, 99], 7: [7, 99], None: [99]}


def states_in(text):
    return {STATE_WORDS[w] for w in re.findall(r'[a-z]+', plain(text)) if w in STATE_WORDS}


def food_state(name):
    found = [STATE_WORDS[w] for w in re.findall(r'[a-z]+', plain(name)) if w in STATE_WORDS]
    return found[-1] if found else None


def ibge_label(measure, ref):
    """Rótulo para a tela: a medida com tamanho e cheia/rasa tirados da própria referência ("concha média cheia")."""
    desc = ref.split(' - ', 1)[1] if ' - ' in ref else ref
    m, d = plain(measure), plain(desc)
    if m in IBGE_FRACTIONS:
        tail = desc.split('colher de sopa', 1)[1].strip() if 'colher de sopa' in d else ''
        return f'{measure.lower()} {tail}'.strip()
    for key in IBGE_KEYS.get(m, [m]):
        i = d.find(key)
        if i >= 0:
            return desc[i:].strip().rstrip('.').lower()
    return measure.lower()


def ibge_accepts(row, state):
    m, ref = plain(row['medida']), plain(row['referencia'])
    if m in IBGE_FRACTIONS:
        ok = IBGE_FRACTIONS[m] in ref
    elif m in IBGE_KEYS:
        tail = ref.split(' - ', 1)[-1]
        ok = any(k in ref for k in IBGE_KEYS[m]) and not re.search(r'\b\d+/\d+\b|\b[2-9] |%', tail)
    else:
        ok = False
    ref_states = states_in(row['referencia'].split(' - ', 1)[0])
    prep = int(row['preparo_cod'])
    if ok and ref_states and prep != 99 and prep not in ref_states:
        ok = False  # a linha diz frito, mas a referência é do ovo cozido: medida emprestada
    if ok and ref_states and state is not None and state not in ref_states:
        ok = False  # o alimento está cru, mas a medida é do alimento cozido
    return ok


def ibge_portions(base_rows, mapping, names):
    """id do alimento -> [[rótulo, gramas], ...] tiradas do IBGE."""
    table = collections.defaultdict(list)
    with open(IBGE_TSV, encoding='utf-8') as fh:
        for row in csv.DictReader(fh, delimiter='\t'):
            table[(row['codigo'], int(row['preparo_cod']))].append(row)
    out = {}
    for food_id, target in mapping['map'].items():
        if food_id not in names:
            continue
        code, _, fixed = target.partition(':')
        state = food_state(names[food_id])
        order = [int(fixed)] if fixed else PREP_ORDER.get(state, [99])
        for prep in order:
            chosen = []
            for row in table.get((code, prep), []):
                if not ibge_accepts(row, state):
                    continue
                label = ibge_label(row['medida'], row['referencia'])
                if label and not any(label == c[0] for c in chosen):
                    chosen.append([label, round(float(row['gramas']), 1)])
            if chosen:
                out[food_id] = chosen
                break
    for food_id, extras in mapping.get('manual', {}).items():
        if food_id not in names:
            continue
        for code, prep, measure, label in extras:
            row = next((r for r in table.get((code, prep), []) if r['medida'] == measure), None)
            if row is None:
                raise SystemExit(f'medida manual não existe no IBGE: {food_id} {code} {prep} {measure}')
            lst = out.setdefault(food_id, [])
            if not any(label == c[0] for c in lst):
                lst.append([label, round(float(row['gramas']), 1)])
    return out


def main():
    final = json.load(open(f'{SCRATCH}/foods-final.json', encoding='utf-8'))
    pt_map = json.load(open(os.path.join(REPO, 'tools', 'traducao-usda-pt.json'), encoding='utf-8'))
    src_rank = {'taco': 0, 'usda-fnd': 1, 'usda-sr': 2}

    rows = []
    for x in final:
        if x['src'] == 'taco':
            name, en = taco_name(x['id'], x['name']), ''
        else:
            name, en = polish(pt_map[x['id']]), x['name']
        rows.append({**x, 'name': name, 'en': en, 'group': GROUP_PT.get(x['group'], x['group'])
                     if x['src'] != 'taco' else x['group']})

    present = {x['id'] for x in final}
    for fid, name, group, kcal, prot, fat, carb, fiber in TACO_ADDED:
        if fid not in present:
            rows.append({'id': fid, 'name': name, 'group': group, 'src': 'taco', 'ref': fid.split('-')[1], 'kcal': kcal,
                         'protein': prot, 'fat': fat, 'carb': carb, 'fiber': fiber, 'en': ''})

    # Resolve colisões de nome (case-insensitive). TACO > Foundation > SR; SR contra SR recebe o original em inglês.
    rows.sort(key=lambda r: (src_rank[r['src']], r['id']))
    seen = {}
    kept = []
    dropped = 0
    for r in rows:
        key = r['name'].lower()
        if key in seen:
            if r['src'] == 'usda-sr' and seen[key]['src'] == 'usda-sr':
                # Colisão entre duas linhas da USDA: o número da referência diferencia (o nome inglês fica em `originalName`).
                r['name'] = f"{r['name']} (USDA {r['ref']})"
                key2 = r['name'].lower()
                if key2 in seen:
                    dropped += 1
                    continue
                seen[key2] = r
                kept.append(r)
            else:
                dropped += 1
            continue
        seen[key] = r
        kept.append(r)

    # Portions
    ports = collections.defaultdict(list)
    with open(f'{SR_DIR}/food_portion.csv', encoding='utf-8') as fh:
        for p in csv.DictReader(fh):
            desc = p['portion_description'] or p['modifier']
            label = unit_label(desc)
            add_portion(ports[f"usda-sr-{p['fdc_id']}"], label, float(p['gram_weight']) if p['gram_weight'] else None,
                        float(p['amount']) if p['amount'] else 1.0)
    fnd = json.load(open(FND_JSON, encoding='utf-8'))['FoundationFoods']
    for f in fnd:
        for p in f.get('foodPortions', []):
            mu = (p.get('measureUnit') or {}).get('name', '')
            desc = mu if mu and mu != 'undetermined' else p.get('modifier', '')
            label = unit_label(desc)
            add_portion(ports[f"usda-fnd-{f['fdcId']}"], label, p.get('gramWeight'), p.get('amount'))

    kept_ids = {r['id'] for r in kept}
    portion_rows = {}
    for fid, lst in ports.items():
        if fid in kept_ids and lst:
            portion_rows[fid] = lst[:8]
    for taco_id, usda_id in TACO_PORTION_LINKS.items():
        if taco_id in kept_ids and portion_rows.get(usda_id):
            portion_rows[taco_id] = portion_rows[usda_id]
    # Medidas caseiras brasileiras do IBGE vêm primeiro; as da USDA, quando houver, completam sem repetir o rótulo.
    mapping = json.load(open(IBGE_MAP, encoding='utf-8'))
    names = {r['id']: r['name'] for r in kept}
    groups = {r['id']: r['group'] for r in kept}
    ibge = ibge_portions(kept, mapping, names)
    for fid, lst in list(ibge.items()):
        cut = list(mapping.get('exclude', {}).get(fid, []))
        # Fruta crua: copo, taça, xícara e prato no inquérito são de suco ou de fruta picada; o rótulo engana.
        if groups.get(fid) == 'Frutas e derivados' and food_state(names[fid]) == 1 and not re.search(r'polpa|suco', plain(names[fid])):
            cut += ['copo', 'taça', 'xícara', 'prato', 'pires']
        kept_list = [c for c in lst if not any(c[0].startswith(x) for x in cut)]
        if kept_list:
            ibge[fid] = kept_list
        else:
            del ibge[fid]
    # Onde o IBGE tem medida brasileira, ela fica sozinha: misturar com a da USDA dava rótulos contraditórios
    # (ovo frito: "unidade média 50 g" do IBGE ao lado de "unidade grande 46 g" da USDA).
    for fid, lst in ibge.items():
        portion_rows[fid] = lst[:10]
    print('alimentos com medida do IBGE', len(ibge))

    # Escreve foods-base.js
    header = HEADER_BASE
    lines = []
    for r in kept:
        vals = [r['id'], r['name'], r['group'], r['src'], r['ref'], r['kcal'], r['protein'], r['fat'], r['carb'], r['fiber'], r['en']]
        lines.append(json.dumps(vals, ensure_ascii=False))
    body = 'export const FOOD_BASE = [\n' + ',\n'.join(lines) + '\n]\n'
    open(OUT_BASE, 'w', encoding='utf-8').write(header + body)

    ph = HEADER_PORTIONS
    pl = [f'{json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in sorted(portion_rows.items())]
    open(OUT_PORT, 'w', encoding='utf-8').write(ph + 'export const FOOD_PORTIONS = {\n' + ',\n'.join(pl) + '\n}\n')

    print('linhas', len(kept), 'descartadas por colisão', dropped)
    print('alimentos com porção em unidade', len(portion_rows))
    print('origens', collections.Counter(r['src'] for r in kept))


if __name__ == '__main__':
    main()
