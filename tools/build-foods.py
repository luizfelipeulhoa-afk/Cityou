# Gera foods-base.js (nomes em português, original em inglês) e foods-portions.js (porções em unidades).
import json, csv, re, collections

SCRATCH = './data-scratch'
SR_DIR = f'{SCRATCH}/usda/sr/FoodData_Central_sr_legacy_food_csv_2018-04'
FND_JSON = f'{SCRATCH}/corrigido/fjson/FoodData_Central_foundation_food_json_2026-10-29.json'
OUT_BASE = '/home/claude/wt/cityou/shared/game/foods-base.js'
OUT_PORT = '/home/claude/wt/cityou/shared/game/foods-portions.js'

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


def main():
    final = json.load(open(f'{SCRATCH}/foods-final.json', encoding='utf-8'))
    pt_map = json.load(open(f'{SCRATCH}/pt/pt-map.json', encoding='utf-8'))
    src_rank = {'taco': 0, 'usda-fnd': 1, 'usda-sr': 2}

    rows = []
    for x in final:
        if x['src'] == 'taco':
            name, en = x['name'], ''
        else:
            name, en = pt_map[x['id']], x['name']
        rows.append({**x, 'name': name, 'en': en, 'group': GROUP_PT.get(x['group'], x['group'])
                     if x['src'] != 'taco' else x['group']})

    # Resolve colisões de nome (case-insensitive). TACO > Foundation > SR; SR contra SR recebe o original em inglês.
    rows.sort(key=lambda r: (src_rank[r['src']], r['id']))
    seen = {}
    kept = []
    dropped = 0
    for r in rows:
        key = r['name'].lower()
        if key in seen:
            if r['src'] == 'usda-sr' and seen[key]['src'] == 'usda-sr':
                r['name'] = f"{r['name']} ({r['en']})"
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

    # Escreve foods-base.js
    header = open('./data-scratch/build/header.txt', encoding='utf-8').read()
    lines = []
    for r in kept:
        vals = [r['id'], r['name'], r['group'], r['src'], r['ref'], r['kcal'], r['protein'], r['fat'], r['carb'], r['fiber'], r['en']]
        lines.append(json.dumps(vals, ensure_ascii=False))
    body = 'export const FOOD_BASE = [\n' + ',\n'.join(lines) + '\n]\n'
    open(OUT_BASE, 'w', encoding='utf-8').write(header + body)

    ph = open('./data-scratch/build/header_portions.txt', encoding='utf-8').read()
    pl = [f'{json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in sorted(portion_rows.items())]
    open(OUT_PORT, 'w', encoding='utf-8').write(ph + 'export const FOOD_PORTIONS = {\n' + ',\n'.join(pl) + '\n}\n')

    print('linhas', len(kept), 'descartadas por colisão', dropped)
    print('alimentos com porção em unidade', len(portion_rows))
    print('origens', collections.Counter(r['src'] for r in kept))


if __name__ == '__main__':
    main()
