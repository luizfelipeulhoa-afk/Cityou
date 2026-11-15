// Treino de musculação sugerido da aba Fitness (pedido do dono, 15/11/2026). Funções puras, sem banco: o Worker
// (worker/training.js) monta o plano e calcula volume e progressão por aqui, e a tela usa o catálogo para os nomes.
//
// É SUGESTÃO, não prescrição. Cada regra cita a fonte em SOURCES (artigos do pacote "Cityou - Evidências científicas
// de musculação", 15/11/2026, guardado no projeto do claude.ai "CityouApp", pasta treino/). O que é escolha de produto e
// não vem de estudo está marcado como tal: a escolha dos exercícios de cada dia (o catálogo).

export const EVIDENCE_PENDING = false
export const SOURCES = {
  iversen2021: { ref: 'Iversen VM et al., 2021. No Time to Lift? Designing Time-Efficient Training Programs for Strength and Hypertrophy. Sports Med 51:2079-95 (PMC8449772).', note: 'mínimo de 4 séries semanais por grupo muscular, faixa de 6 a 15 RM; diretrizes: 2 a 4 séries por grupo, 2 a 3 vezes por semana (4 a 12 séries semanais) para quem não treina ou treina há pouco' },
  iusca2021: { ref: 'Schoenfeld BJ et al., 2021. Resistance Training Recommendations to Maximize Muscle Hypertrophy in an Athletic Population: Position Stand of the IUSCA. Int J Strength Cond 1(1).', note: 'cerca de 10 séries por músculo por semana como mínimo geral para otimizar a hipertrofia em quem treina; até ~10 por sessão; hipertrofia parecida numa faixa ampla de cargas; uma vez por semana basta em volume baixo a moderado; descanso de pelo menos 2 min nos multiarticulares e de 60 a 90 s nos uniarticulares' },
  acsm2009: { ref: 'Ratamess NA et al., 2009. American College of Sports Medicine position stand. Progression models in resistance training for healthy adults. Med Sci Sports Exerc 41:687-708.', note: 'subir a carga de 2% a 10% quando a pessoa passa uma ou duas repetições do alvo' },
  refalo2022: { ref: 'Refalo MC et al., 2022. Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy. Sports Med 53:649-65 (PMC9935748).', note: 'treinar até a falha teve vantagem trivial sobre não ir à falha: parar com repetições sobrando é aceitável' },
  singer2024: { ref: 'Singer A et al., 2024. Give it a rest: inter-set rest interval duration and muscle hypertrophy. Front Sports Act Living 6:1429789 (PMC11349676).', note: 'pequeno benefício com descanso acima de 60 s; sem diferença perceptível acima de 90 s' },
  plotkin2022: { ref: 'Plotkin D et al., 2022. Progressive overload without progressing load? PeerJ 10:e14142 (PMC9528903).', note: 'progredir por repetições ou por carga são estratégias viáveis (dupla progressão)' },
  evangelista2021: { ref: 'Evangelista AL et al., 2021. Split or full-body workout routine: which is best to increase muscle strength and hypertrophy? Einstein (São Paulo) 19:eAO5781 (PMC8372753).', note: 'treinar 2 ou 4 vezes por semana com o mesmo volume semanal dá adaptações parecidas: a divisão pode seguir os dias disponíveis' },
  who2020: { ref: 'Bull FC et al., 2020. WHO guidelines on physical activity and sedentary behaviour. Br J Sports Med 54:1451-62 (PMC7719906).', note: 'adultos: fortalecimento de todos os grandes grupos musculares em 2 ou mais dias por semana' },
  equipment: { ref: 'Haugen ME et al., 2023. Free-weight vs. machine-based strength training. BMC Sports Sci Med Rehabil 15:103 (PMC10426227); Ogawa M et al., 2023. Free weight and body mass-based resistance training. Exp Physiol 108:975-85 (PMC10988481).', note: 'peso livre e máquina sem diferença de hipertrofia; treino com o peso do corpo comparável ao peso livre em jovens e adultos de meia-idade' },
  deficit: { ref: 'Deller M et al., 2026. Effects of Calorie Restriction With and Without Strength, Endurance or Mixed Training on Fat-Free and Skeletal Muscle Mass. Diabetes Obes Metab 28:6810-23 (PMC13341414).', note: 'na restrição calórica, o treino de força e o misto preservaram a massa livre de gordura melhor que só a dieta' },
  concurrent: { ref: 'Schumann M et al., 2021. Compatibility of Concurrent Aerobic and Strength Training. Sports Med 52:601-12 (PMC8891239).', note: 'aeróbio junto com musculação não compromete a hipertrofia nem a força máxima' },
  epley: { ref: 'Epley B, 1985. Poundage chart. Boyd Epley Workout.', note: 'estimativa de 1RM: carga × (1 + repetições / 30), só até 12 repetições (fórmula de uso comum, não está no pacote)' },
}

export const DAYS_RANGE = [1, 6]
export const EXPERIENCE = ['beginner', 'intermediate', 'advanced']
// gym: academia completa; dumbbells: em casa com halteres e banco; bodyweight: só o peso do corpo.
export const EQUIPMENT = ['gym', 'dumbbells', 'bodyweight']

// Catálogo (escolha de produto; a lista de movimentos usou como referência os nomes, músculos e equipamentos da
// free-exercise-db, domínio público; nomes e dicas em português são nossos, sem copiar textos nem usar imagens de lá,
// cuja origem é desconhecida). `pattern` é o movimento que o plano pede (os sem uso nos modelos de dia servem para trocar
// e para o registro livre); `setups` diz onde o exercício cabe; `compound` (multiarticular) muda a faixa de repetições e
// o descanso; `bodyweight` diz que a carga anotada é a extra (colete, mochila), e pode ser 0; `tip` é a dica da tela.
const E = (id, name, group, pattern, setups, tip, { compound = false, bodyweight = false, needs = [] } = {}) =>
  ({ id, name, group, pattern, setups, tip, compound, bodyweight, needs })
const ALL = ['gym', 'dumbbells', 'bodyweight']
const GYM = ['gym']
const DB = ['gym', 'dumbbells']
const HOME = ['dumbbells', 'bodyweight']
const BW = ['bodyweight']
const C = { compound: true }
const CB = { compound: true, bodyweight: true }
const B = { bodyweight: true }
// Itens que nem toda casa tem (a academia tem todos). Fora da academia, o exercício só entra se a pessoa marcou o item.
export const EXTRAS = { pullup_bar: 'Barra fixa', bench: 'Banco ou cadeira firme', low_bar: 'Barra baixa ou mesa firme para remada' }
const needs = (opts, ...items) => ({ ...opts, needs: items })

export const EXERCISES = [
  // Os 35 primeiros: a ordem decide o que o plano escolhe primeiro em cada movimento. Novos entram no fim.
  E('agachamento-livre', 'Agachamento livre com barra', 'Quadríceps e glúteos', 'squat', GYM, 'Barra apoiada no alto das costas, pés na largura dos ombros; desça com o tronco firme até onde mantiver a coluna neutra.', C),
  E('leg-press', 'Leg press 45°', 'Quadríceps e glúteos', 'squat', GYM, 'Lombar colada no encosto; desça até os joelhos formarem cerca de 90° e empurre com o pé inteiro.', C),
  E('agachamento-goblet', 'Agachamento goblet com halter', 'Quadríceps e glúteos', 'squat', ['dumbbells'], 'Halter junto ao peito, cotovelos para dentro; desça entre os joelhos com o peito aberto.', C),
  E('agachamento-corpo', 'Agachamento livre (peso do corpo)', 'Quadríceps e glúteos', 'squat', BW, 'Braços à frente para equilibrar; quadril para trás e para baixo, joelhos na direção dos pés.', CB),
  E('terra-romeno', 'Levantamento terra romeno com barra', 'Posterior de coxa e glúteos', 'hinge', GYM, 'Joelhos levemente flexionados; leve o quadril para trás com a barra rente às pernas até sentir a parte de trás da coxa.', C),
  E('stiff-halteres', 'Stiff com halteres', 'Posterior de coxa e glúteos', 'hinge', ['dumbbells'], 'Halteres à frente das coxas; quadril para trás, costas retas, volte apertando o glúteo.', C),
  E('ponte-gluteo', 'Ponte de glúteo', 'Glúteos', 'hinge', BW, 'Deitado, pés no chão perto do quadril; suba o quadril até alinhar com os joelhos e segure um instante.', CB),
  E('afundo-halteres', 'Afundo com halteres', 'Quadríceps e glúteos', 'lunge', DB, 'Um passo à frente, desça o joelho de trás em direção ao chão; o joelho da frente acompanha o pé.', C),
  E('afundo-corpo', 'Afundo (peso do corpo)', 'Quadríceps e glúteos', 'lunge', BW, 'Passo à frente, tronco reto, desça até quase encostar o joelho de trás no chão.', CB),
  E('bulgaro', 'Agachamento búlgaro', 'Quadríceps e glúteos', 'lunge', ALL, 'Pé de trás apoiado num banco; desça na perna da frente com o tronco levemente inclinado.', needs(CB, 'bench')),
  E('cadeira-extensora', 'Cadeira extensora', 'Quadríceps', 'knee_ext', GYM, 'Joelho alinhado ao eixo da máquina; estenda a perna sem tirar o quadril do banco e desça devagar.'),
  E('mesa-flexora', 'Mesa flexora', 'Posterior de coxa', 'knee_flex', GYM, 'Quadril colado no banco; puxe o rolo em direção ao glúteo e volte controlando.'),
  E('stiff-unilateral', 'Stiff unilateral com halter', 'Posterior de coxa', 'knee_flex', ['dumbbells'], 'Apoio numa perna, a outra vai para trás enquanto o tronco desce; costas retas, quadril nivelado.'),
  E('ponte-unilateral', 'Ponte de glúteo unilateral', 'Posterior de coxa e glúteos', 'knee_flex', BW, 'Como a ponte, com uma perna estendida no ar; suba sem girar o quadril.', B),
  E('panturrilha-pe', 'Panturrilha em pé', 'Panturrilha', 'calf', ALL, 'Ponta dos pés num degrau; desça o calcanhar abaixo do degrau e suba o mais alto que der.', B),
  E('supino-reto', 'Supino reto com barra', 'Peito', 'h_push', GYM, 'Escápulas juntas e pés firmes; desça a barra até o meio do peito e empurre de volta.', C),
  E('supino-halteres', 'Supino reto com halteres', 'Peito', 'h_push', ['dumbbells'], 'Halteres na linha do peito, cotovelos a cerca de 45° do corpo; empurre aproximando os halteres.', needs(C, 'bench')),
  E('flexao', 'Flexão de braço', 'Peito', 'h_push', BW, 'Corpo em linha reta da cabeça aos pés; desça o peito perto do chão. Fica pesado? Apoie os joelhos.', CB),
  E('supino-inclinado-halteres', 'Supino inclinado com halteres', 'Peito', 'incline_push', DB, 'Banco a 30° a 45°; desça os halteres ao lado da parte de cima do peito.', needs(C, 'bench')),
  E('flexao-pes-elevados', 'Flexão com pés elevados', 'Peito', 'incline_push', HOME, 'Pés num banco ou cadeira; mantenha o abdômen firme e desça o peito.', needs(CB, 'bench')),
  E('desenvolvimento-halteres', 'Desenvolvimento com halteres', 'Ombros', 'v_push', DB, 'Sentado ou em pé, halteres na altura das orelhas; empurre para cima sem arquear a lombar.', C),
  E('flexao-pike', 'Flexão pike', 'Ombros', 'v_push', BW, 'Quadril alto, corpo em V invertido; desça a cabeça entre as mãos.', CB),
  E('puxada-frontal', 'Puxada frontal', 'Costas', 'v_pull', GYM, 'Peito aberto, puxe a barra até a parte de cima do peito levando os cotovelos para baixo.', C),
  E('barra-fixa', 'Barra fixa (ou só a descida, devagar)', 'Costas', 'v_pull', HOME, 'Pegada um pouco mais larga que os ombros; suba o queixo acima da barra. Se não subir, faça só a descida em 3 a 5 s.', needs(CB, 'pullup_bar')),
  E('remada-curvada', 'Remada curvada com barra', 'Costas', 'h_pull', GYM, 'Tronco inclinado e costas retas; puxe a barra até a barriga juntando as escápulas.', C),
  E('remada-unilateral', 'Remada unilateral com halter', 'Costas', 'h_pull', DB, 'Mão e joelho apoiados no banco; puxe o halter em direção ao quadril.', needs(C, 'bench')),
  E('remada-invertida', 'Remada invertida (na mesa ou barra baixa)', 'Costas', 'h_pull', BW, 'Deitado sob uma mesa firme ou barra baixa; puxe o peito até ela com o corpo reto.', needs(CB, 'low_bar')),
  E('elevacao-lateral', 'Elevação lateral com halteres', 'Ombros', 'lateral', DB, 'Cotovelos levemente dobrados; suba os braços para o lado até a altura dos ombros.'),
  E('rosca-direta', 'Rosca direta', 'Bíceps', 'biceps', DB, 'Cotovelos colados ao corpo; suba o peso sem balançar o tronco.'),
  E('barra-supinada', 'Barra fixa com pegada supinada', 'Bíceps e costas', 'biceps', BW, 'Palmas viradas para você, mãos na largura dos ombros; suba o queixo acima da barra.', needs(CB, 'pullup_bar')),
  E('triceps-polia', 'Tríceps na polia', 'Tríceps', 'triceps', GYM, 'Cotovelos parados junto ao corpo; estenda os braços até o fim e volte devagar.'),
  E('triceps-frances', 'Tríceps francês com halter', 'Tríceps', 'triceps', ['dumbbells'], 'Halter atrás da cabeça com as duas mãos; estenda os braços apontando os cotovelos para cima.'),
  E('mergulho-banco', 'Mergulho no banco', 'Tríceps', 'triceps', BW, 'Mãos na borda de um banco ou cadeira firme; desça dobrando os cotovelos para trás.', needs(B, 'bench')),
  E('prancha', 'Prancha (anote segundos como repetições)', 'Abdômen', 'core', ALL, 'Antebraços no chão, corpo em linha reta; aperte o abdômen e o glúteo sem deixar o quadril cair.', B),

  // Peito
  E('supino-inclinado-barra', 'Supino inclinado com barra', 'Peito', 'incline_push', GYM, 'Banco a 30° a 45°; desça a barra até a parte de cima do peito.', C),
  E('supino-declinado', 'Supino declinado com barra', 'Peito', 'h_push', GYM, 'Pernas presas no apoio; desça a barra até a parte de baixo do peito.', C),
  E('supino-maquina', 'Supino na máquina', 'Peito', 'h_push', GYM, 'Pegadores na linha do meio do peito; empurre sem tirar as costas do encosto.', C),
  E('crucifixo-halteres', 'Crucifixo com halteres', 'Peito', 'chest_fly', DB, 'Cotovelos levemente dobrados e fixos; abra os braços até sentir o peito alongar e feche como num abraço.', needs({}, 'bench')),
  E('voador', 'Voador (crucifixo na máquina)', 'Peito', 'chest_fly', GYM, 'Cotovelos na altura dos ombros; feche os braços à frente do peito e volte devagar.'),
  E('crossover', 'Crossover na polia', 'Peito', 'chest_fly', GYM, 'Um passo à frente entre as polias; traga as mãos para baixo e à frente do corpo, cruzando de leve.'),
  E('paralelas', 'Mergulho nas paralelas', 'Peito', 'h_push', GYM, 'Tronco levemente inclinado à frente; desça até os ombros ficarem na altura dos cotovelos.', CB),
  E('flexao-joelhos', 'Flexão de braço com joelhos apoiados', 'Peito', 'h_push', BW, 'Joelhos no chão, quadril alinhado ao tronco; desça o peito até perto do chão.', CB),
  E('flexao-diamante', 'Flexão diamante', 'Tríceps', 'triceps', BW, 'Mãos juntas formando um losango sob o peito; desça com os cotovelos rentes ao corpo.', CB),
  // Costas e lombar
  E('levantamento-terra', 'Levantamento terra com barra', 'Posterior de coxa e glúteos', 'hinge', GYM, 'Barra sobre o meio do pé, costas retas; empurre o chão com as pernas e estenda o quadril no fim.', C),
  E('puxada-triangulo', 'Puxada com triângulo', 'Costas', 'v_pull', GYM, 'Pegada fechada; puxe o triângulo até o peito levando os cotovelos para baixo.', C),
  E('remada-baixa', 'Remada baixa na polia', 'Costas', 'h_pull', GYM, 'Sentado, coluna ereta; puxe até a barriga juntando as escápulas, sem balançar o tronco.', C),
  E('remada-maquina', 'Remada na máquina', 'Costas', 'h_pull', GYM, 'Peito apoiado; puxe os pegadores levando os cotovelos para trás.', C),
  E('remada-cavalinho', 'Remada cavalinho (barra T)', 'Costas', 'h_pull', GYM, 'Tronco inclinado, costas retas; puxe a barra até o peito.', C),
  E('remada-curvada-halteres', 'Remada curvada com halteres', 'Costas', 'h_pull', DB, 'Tronco inclinado, um halter em cada mão; puxe os dois em direção ao quadril.', C),
  E('pulldown-braco-reto', 'Pulldown com braços estendidos', 'Costas', 'lat_iso', GYM, 'Braços quase retos; leve a barra da polia da altura da cabeça até as coxas.'),
  E('pullover-halter', 'Pullover com halter', 'Costas', 'lat_iso', DB, 'Deitado no banco, halter acima do peito; leve-o para trás da cabeça com os braços quase retos e volte.', needs({}, 'bench')),
  E('hiperextensao', 'Hiperextensão lombar (banco romano)', 'Lombar', 'back_ext', GYM, 'Quadril no apoio; desça o tronco e suba até alinhar com as pernas, sem passar disso.'),
  E('superman', 'Superman (extensão no chão)', 'Lombar', 'back_ext', BW, 'De bruços, levante braços e pernas juntos alguns centímetros e segure um instante.', B),
  E('good-morning', 'Bom-dia com barra', 'Posterior de coxa e glúteos', 'hinge', GYM, 'Barra nas costas, joelhos levemente dobrados; incline o tronco à frente levando o quadril para trás.', C),
  E('terra-sumo', 'Levantamento terra sumô', 'Posterior de coxa e glúteos', 'hinge', GYM, 'Pés bem afastados e virados para fora, mãos por dentro das pernas; suba com o peito aberto.', C),
  E('kettlebell-swing', 'Swing com kettlebell', 'Posterior de coxa e glúteos', 'hinge', DB, 'Movimento do quadril, não dos braços: leve o kettlebell entre as pernas e projete o quadril à frente.', C),
  // Ombros e trapézio
  E('desenvolvimento-barra', 'Desenvolvimento militar com barra', 'Ombros', 'v_push', GYM, 'Em pé, abdômen e glúteo firmes; empurre a barra da clavícula até acima da cabeça.', C),
  E('desenvolvimento-maquina', 'Desenvolvimento na máquina', 'Ombros', 'v_push', GYM, 'Costas no encosto; empurre os pegadores para cima sem travar os cotovelos.', C),
  E('desenvolvimento-arnold', 'Desenvolvimento Arnold', 'Ombros', 'v_push', DB, 'Comece com as palmas viradas para você e gire os halteres enquanto empurra para cima.', C),
  E('elevacao-frontal', 'Elevação frontal com halteres', 'Ombros', 'front_raise', DB, 'Braços quase retos; suba os halteres à frente até a altura dos ombros.'),
  E('elevacao-lateral-polia', 'Elevação lateral na polia', 'Ombros', 'lateral', GYM, 'Polia baixa do lado oposto; suba o braço para o lado até a altura do ombro.'),
  E('crucifixo-invertido', 'Crucifixo invertido com halteres', 'Ombros', 'rear_delt', DB, 'Tronco inclinado à frente; abra os braços para os lados apertando a parte de trás dos ombros.'),
  E('face-pull', 'Face pull na polia', 'Ombros', 'rear_delt', GYM, 'Corda na altura do rosto; puxe abrindo as mãos para os lados das orelhas.'),
  E('crucifixo-invertido-maquina', 'Crucifixo invertido na máquina', 'Ombros', 'rear_delt', GYM, 'Peito no encosto; abra os braços para trás com os cotovelos levemente dobrados.'),
  E('remada-alta', 'Remada alta', 'Ombros', 'upright_row', DB, 'Peso junto ao corpo; puxe até a altura do peito com os cotovelos acima das mãos. Pare se incomodar o ombro.'),
  E('encolhimento-halteres', 'Encolhimento com halteres', 'Trapézio', 'shrug', DB, 'Braços estendidos; suba os ombros em direção às orelhas sem dobrar os cotovelos.'),
  E('encolhimento-barra', 'Encolhimento com barra', 'Trapézio', 'shrug', GYM, 'Barra à frente das coxas; suba os ombros e desça devagar.'),
  // Bíceps e antebraço
  E('rosca-martelo', 'Rosca martelo', 'Bíceps', 'biceps', DB, 'Palmas viradas uma para a outra; suba os halteres sem mexer os cotovelos.'),
  E('rosca-alternada', 'Rosca alternada com halteres', 'Bíceps', 'biceps', DB, 'Um braço de cada vez, girando a palma para cima ao subir.'),
  E('rosca-scott', 'Rosca Scott', 'Bíceps', 'biceps', GYM, 'Braços apoiados no banco Scott; suba o peso e desça até quase estender.'),
  E('rosca-polia', 'Rosca na polia', 'Bíceps', 'biceps', GYM, 'De frente para a polia baixa; suba a barra com os cotovelos fixos.'),
  E('rosca-concentrada', 'Rosca concentrada', 'Bíceps', 'biceps', ['dumbbells'], 'Sentado, cotovelo apoiado na parte de dentro da coxa; suba o halter devagar.', needs({}, 'bench')),
  E('rosca-punho', 'Rosca de punho', 'Antebraço', 'forearm', DB, 'Antebraço apoiado na coxa, palma para cima; mexa só o punho.'),
  // Tríceps
  E('triceps-testa', 'Tríceps testa', 'Tríceps', 'triceps', GYM, 'Deitado, barra acima do peito; dobre só os cotovelos levando a barra até perto da testa.'),
  E('triceps-corda', 'Tríceps na corda', 'Tríceps', 'triceps', GYM, 'Cotovelos junto ao corpo; estenda e abra a corda no fim do movimento.'),
  E('triceps-coice', 'Tríceps coice com halter', 'Tríceps', 'triceps', ['dumbbells'], 'Tronco inclinado, braço paralelo ao chão; estenda o cotovelo para trás.'),
  E('supino-fechado', 'Supino com pegada fechada', 'Tríceps', 'triceps', GYM, 'Mãos na largura dos ombros, cotovelos rentes ao corpo; desça a barra até a parte de baixo do peito.', C),
  // Pernas
  E('agachamento-frontal', 'Agachamento frontal', 'Quadríceps e glúteos', 'squat', GYM, 'Barra apoiada na frente dos ombros, cotovelos altos; desça com o tronco bem ereto.', C),
  E('agachamento-smith', 'Agachamento no Smith', 'Quadríceps e glúteos', 'squat', GYM, 'Pés um pouco à frente da barra; desça controlando e empurre com o pé inteiro.', C),
  E('hack', 'Agachamento hack', 'Quadríceps e glúteos', 'squat', GYM, 'Costas apoiadas na máquina; desça até cerca de 90° nos joelhos.', C),
  E('agachamento-sumo', 'Agachamento sumô com halter', 'Quadríceps e glúteos', 'squat', DB, 'Pés afastados e virados para fora, halter entre as pernas; desça com o peito aberto.', C),
  E('avanco', 'Avanço caminhando com halteres', 'Quadríceps e glúteos', 'lunge', DB, 'Passos à frente alternando as pernas, descendo o joelho de trás perto do chão a cada passo.', C),
  E('afundo-reverso', 'Afundo reverso', 'Quadríceps e glúteos', 'lunge', ALL, 'Passo para trás em vez de para a frente; costuma ser mais fácil para os joelhos.', CB),
  E('subida-banco', 'Subida no banco (step-up)', 'Quadríceps e glúteos', 'lunge', ALL, 'Suba num banco firme com uma perna, empurrando pelo calcanhar, e desça devagar.', needs(CB, 'bench')),
  E('elevacao-pelvica', 'Elevação pélvica com barra', 'Glúteos', 'glute', GYM, 'Costas apoiadas num banco, barra no quadril; suba até o tronco ficar paralelo ao chão.', C),
  E('elevacao-pelvica-halter', 'Elevação pélvica com halter', 'Glúteos', 'glute', ['dumbbells'], 'Costas apoiadas num banco ou sofá firme, halter no quadril; suba apertando o glúteo.', needs(C, 'bench')),
  E('coice-polia', 'Coice de glúteo na polia', 'Glúteos', 'glute', GYM, 'Tornozeleira na polia baixa; leve a perna para trás sem arquear a lombar.'),
  E('cadeira-adutora', 'Cadeira adutora', 'Adutores', 'adductor', GYM, 'Feche as pernas contra as almofadas e abra devagar.'),
  E('cadeira-abdutora', 'Cadeira abdutora', 'Abdutores e glúteos', 'abductor', GYM, 'Abra as pernas contra as almofadas com o tronco firme e volte devagar.'),
  E('abducao-deitado', 'Abdução de quadril deitado de lado', 'Abdutores e glúteos', 'abductor', BW, 'Deitado de lado, perna de cima reta; suba a perna sem girar o quadril.', B),
  E('cadeira-flexora', 'Cadeira flexora', 'Posterior de coxa', 'knee_flex', GYM, 'Sentado, joelho alinhado ao eixo; puxe o rolo para baixo e volte devagar.'),
  E('flexao-nordica', 'Flexão nórdica', 'Posterior de coxa', 'knee_flex', BW, 'Ajoelhado com os pés presos; desça o tronco à frente o mais devagar que conseguir. É exigente: comece com pouco.', B),
  E('panturrilha-sentada', 'Panturrilha sentada', 'Panturrilha', 'calf', GYM, 'Joelhos sob o apoio; desça o calcanhar e suba nas pontas dos pés.'),
  E('panturrilha-leg-press', 'Panturrilha no leg press', 'Panturrilha', 'calf', GYM, 'Só a ponta dos pés na plataforma; empurre estendendo o tornozelo.'),
  // Abdômen
  E('abdominal-crunch', 'Abdominal crunch', 'Abdômen', 'core', ALL, 'Deitado, joelhos dobrados; tire as escápulas do chão enrolando o tronco, sem puxar o pescoço.', B),
  E('elevacao-pernas', 'Elevação de pernas deitado', 'Abdômen', 'core', ALL, 'Lombar colada no chão; suba as pernas juntas e desça sem encostar os pés.', B),
  E('prancha-lateral', 'Prancha lateral (anote segundos como repetições)', 'Abdômen', 'core', ALL, 'Apoio num antebraço, corpo em linha reta de lado; não deixe o quadril cair.', B),
  E('dead-bug', 'Dead bug', 'Abdômen', 'core', ALL, 'Deitado, braços e pernas para cima; estenda braço e perna opostos com a lombar colada no chão.', B),
  E('abdominal-bicicleta', 'Abdominal bicicleta', 'Abdômen', 'core', ALL, 'Leve o cotovelo em direção ao joelho oposto, alternando, sem puxar o pescoço.', B),
  E('abdominal-polia', 'Abdominal na polia', 'Abdômen', 'core', GYM, 'Ajoelhado, corda junto à cabeça; enrole o tronco para baixo contraindo o abdômen.'),
  E('elevacao-joelhos-barra', 'Elevação de joelhos na barra', 'Abdômen', 'core', ['gym', 'dumbbells', 'bodyweight'], 'Pendurado na barra; suba os joelhos em direção ao peito sem balançar.', needs(B, 'pullup_bar')),
  E('roda-abdominal', 'Roda abdominal', 'Abdômen', 'core', GYM, 'Ajoelhado, role a roda à frente até onde mantiver a lombar firme e volte.', B),
  E('russian-twist', 'Giro russo', 'Abdômen', 'core', ALL, 'Sentado, tronco inclinado para trás; gire o tronco de um lado para o outro.', B),
  // Sem banco nem barra: alternativas para casa.
  E('supino-chao', 'Supino no chão com halteres', 'Peito', 'h_push', ['dumbbells'], 'Deitado no chão, joelhos dobrados; empurre os halteres para cima e desça até os cotovelos tocarem o chão.', C),
  E('remada-mochila', 'Remada curvada com mochila', 'Costas', 'h_pull', BW, 'Mochila com peso (livros, garrafas) nas mãos; tronco inclinado e costas retas, puxe até a barriga. Anote o peso da mochila.', C),
  E('rosca-mochila', 'Rosca com mochila', 'Bíceps', 'biceps', BW, 'Segure a alça da mochila com peso; suba com os cotovelos colados ao corpo. Anote o peso da mochila.'),
  E('escalador', 'Escalador (mountain climber)', 'Abdômen', 'core', ALL, 'Em posição de flexão, traga os joelhos ao peito alternando, com o quadril baixo.', B),
]
export const EXERCISE_BY_ID = Object.fromEntries(EXERCISES.map(exercise => [exercise.id, exercise]))

// Divisão por dias na semana (evangelista2021 e iusca2021: com o mesmo volume semanal, a frequência muda pouco, então
// a divisão acompanha os dias disponíveis e o teto de ~10 séries por músculo por sessão): 1 a 3 dias, corpo inteiro; 4, superior e inferior duas vezes; 5, superior, inferior, empurrar, puxar,
// pernas; 6, empurrar, puxar e pernas duas vezes. Com 1 dia, a tela lembra que a OMS recomenda 2 ou mais (who2020).
const DAY_TEMPLATES = {
  fullA: ['Corpo inteiro A', ['squat', 'h_push', 'v_pull', 'hinge', 'lateral', 'core']],
  fullB: ['Corpo inteiro B', ['hinge', 'incline_push', 'h_pull', 'lunge', 'biceps', 'triceps']],
  fullC: ['Corpo inteiro C', ['lunge', 'v_push', 'v_pull', 'knee_flex', 'calf', 'core']],
  upperA: ['Superior A', ['h_push', 'v_pull', 'v_push', 'h_pull', 'biceps', 'triceps']],
  upperB: ['Superior B', ['incline_push', 'h_pull', 'lateral', 'v_pull', 'triceps', 'biceps']],
  lowerA: ['Inferior A', ['squat', 'hinge', 'knee_ext', 'calf', 'core']],
  lowerB: ['Inferior B', ['hinge', 'lunge', 'knee_flex', 'calf', 'core']],
  push: ['Empurrar', ['h_push', 'v_push', 'incline_push', 'lateral', 'triceps']],
  pull: ['Puxar', ['v_pull', 'h_pull', 'h_pull', 'biceps', 'core']],
  legs: ['Pernas', ['squat', 'hinge', 'lunge', 'knee_flex', 'calf']],
}
export const SPLITS = {
  1: ['fullA'], 2: ['fullA', 'fullB'], 3: ['fullA', 'fullB', 'fullC'],
  4: ['upperA', 'lowerA', 'upperB', 'lowerB'], 5: ['upperA', 'lowerA', 'push', 'pull', 'legs'],
  6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
}

// Séries, repetições, esforço e descanso. A meta vem da base calórica: o treino de força é o mesmo para ganhar massa e
// para perder gordura (na perda, ele preserva a massa livre de gordura: deficit); quem muda é a alimentação.
// Séries por exercício (iversen2021, iusca2021): quem começa fica perto do mínimo de 4 séries semanais por grupo; quem já
// treina sobe em direção às ~10 do IUSCA, conforme os dias. Repetições dentro dos 6 a 15 RM (iversen2021, iusca2021).
// Descanso: 2 min nos multiarticulares e 90 s nos uniarticulares (iusca2021; singer2024: acima de 90 s, pouca diferença).
// Parar com 1 a 3 repetições sobrando (refalo2022).
const MAX_SETS_PER_EXERCISE = { beginner: 3, intermediate: 4, advanced: 4 }
const REPS = { compound: [6, 12], isolation: [10, 15] }
const REST_SECONDS = { compound: 120, isolation: 90 }
export const RIR = [1, 3] // repetições que ainda daria para fazer ao fim da série
// Séries semanais por grupo que o plano mira (iversen2021 para quem começa; iusca2021 para quem já treina).
export const SMALL_GROUPS = ['Bíceps', 'Tríceps', 'Panturrilha', 'Abdômen', 'Quadríceps', 'Posterior de coxa', 'Antebraço', 'Trapézio']
export const WEEKLY_SETS_TARGET = { beginner: 4, intermediate: 10, advanced: 10 }

/** O exercício cabe no lugar e nos itens que a pessoa tem (na academia, tudo). */
export const available = (exercise, equipment, extras = []) =>
  exercise.setups.includes(equipment) && (equipment === 'gym' || exercise.needs.every(item => extras.includes(item)))

function pick(pattern, equipment, extras, used) {
  return EXERCISES.find(exercise => exercise.pattern === pattern && available(exercise, equipment, extras) && !used.has(exercise.id)) ?? null
}

/**
 * Plano sugerido: um treino por dia escolhido, cada um com exercícios, séries, faixa de repetições e descanso. As séries
 * de cada exercício saem do alvo semanal do grupo dividido pelas vezes que ele aparece na semana, entre o piso e o teto
 * da experiência (quem começa: 2 a 3; quem já treina: 3 a 4).
 */
export function suggestPlan({ days, experience, equipment, goal, extras = [] }) {
  if (!Number.isInteger(days) || days < DAYS_RANGE[0] || days > DAYS_RANGE[1]) throw new RangeError('days')
  if (!EXPERIENCE.includes(experience) || !EQUIPMENT.includes(equipment)) throw new RangeError('setup')
  const chosen = SPLITS[days].map(key => {
    const [label, patterns] = DAY_TEMPLATES[key]
    const used = new Set()
    const exercises = []
    for (const pattern of patterns) {
      const exercise = pick(pattern, equipment, extras, used)
      if (!exercise) continue // sem opção para esse equipamento (por exemplo, puxada sem barra fixa)
      used.add(exercise.id)
      exercises.push(exercise)
    }
    return { label, exercises }
  })
  // Dose semanal por grupo (iversen2021, iusca2021): cada grupo tem um orçamento de séries na semana, repartido entre as
  // vezes em que aparece, com pelo menos 1 série e no máximo o teto por exercício. Grupo que já gastou o orçamento sai
  // dos dias seguintes, salvo se o dia ficaria com menos de 3 exercícios. Assim mais dias espalham a dose, não a aumentam.
  const high = MAX_SETS_PER_EXERCISE[experience]
  const target = WEEKLY_SETS_TARGET[experience]
  const times = {}
  for (const day of chosen) for (const exercise of day.exercises) times[exercise.group] = (times[exercise.group] ?? 0) + 1
  // Grupos que já trabalham nos multiarticulares (braços, panturrilha, abdômen, coxa isolada) recebem metade do orçamento
  // (escolha do Cityou a validar; evita que mais dias inflem os exercícios pequenos).
  const left = Object.fromEntries(Object.keys(times).map(group => [group, SMALL_GROUPS.includes(group) ? Math.ceil(target / 2) : target]))
  const seen = {}
  return {
    goal, provisional: EVIDENCE_PENDING, rir: RIR, weekly_sets_target: target,
    days: chosen.map(({ label, exercises }, index) => {
      const items = []
      exercises.forEach((exercise, position) => {
        const group = exercise.group
        const remaining = times[group] - (seen[group] ?? 0)
        seen[group] = (seen[group] ?? 0) + 1
        const stillNeeded = exercises.length - position - 1
        if (left[group] <= 0 && items.length + stillNeeded >= 3) return
        const sets = Math.min(high, Math.max(1, Math.ceil(left[group] / remaining)))
        left[group] -= sets
        const kind = exercise.compound ? 'compound' : 'isolation'
        items.push({ exercise_id: exercise.id, name: exercise.name, group, sets, reps: REPS[kind], rest_s: REST_SECONDS[kind] })
      })
      return { index: index + 1, label, exercises: items }
    }),
  }
}

/** Volume da sessão em kg: soma de carga × repetições de todas as séries (no exercício com o corpo, só a carga extra). */
export const setVolumeKg = set => set.weight_grams * set.reps / 1000
export const exerciseVolumeKg = exercise => round1(exercise.sets.reduce((sum, set) => sum + setVolumeKg(set), 0))
export const sessionVolumeKg = exercises => round1(exercises.reduce((sum, exercise) => sum + exerciseVolumeKg(exercise), 0))
export const totalReps = exercises => exercises.reduce((sum, exercise) => sum + exercise.sets.reduce((s, set) => s + set.reps, 0), 0)
const round1 = value => Math.round(value * 10) / 10

/** 1RM estimado (Epley), em kg; null acima de 12 repetições, sem carga ou sem repetição. */
export function estimatedOneRepMax(weightGrams, reps) {
  if (!weightGrams || reps < 1 || reps > 12) return null
  return round1(weightGrams / 1000 * (1 + (reps === 1 ? 0 : reps / 30)))
}

/** Melhor série do exercício na sessão: a de maior carga e, no empate, a de mais repetições. */
export function topSet(sets) {
  return sets.reduce((best, set) => (!best || set.weight_grams > best.weight_grams ||
    (set.weight_grams === best.weight_grams && set.reps > best.reps) ? set : best), null)
}

/** Menor aumento que dá para montar: halter e mochila de 1 kg em 1 kg; barra, 2 kg (um disco de 1 kg de cada lado);
 * máquina e polia, 2,5 kg. Escolha de produto, para a sugestão caber no equipamento. */
export function loadStep(exercise) {
  if (exercise.bodyweight || exercise.setups.includes('dumbbells') || exercise.setups.includes('bodyweight')) return 1000
  if (/barra(?! fixa)|Smith|terra|Bom-dia|testa|fechado/i.test(exercise.name)) return 2000
  return 2500
}

/**
 * Próxima carga sugerida pelo histórico do exercício (sessões da mais antiga para a mais nova, cada uma com `sets` e
 * `pain`). Dupla progressão (plotkin2022): sobe só quando TODAS as séries da última sessão foram com a mesma carga e
 * chegaram ao topo da faixa; o aumento é ~2,5% arredondado para cima ao passo do equipamento e não passa de 10%
 * (acsm2009: 2% a 10%); acima disso, o certo é ganhar repetições antes. Abaixo do piso, mantém; abaixo do piso em duas
 * sessões seguidas com a mesma carga, sugere reduzir ~10% (ou menos séries ou uma variação mais fácil). Dor anotada
 * no exercício pausa a progressão dele. As regras de redução e de dor são escolhas do Cityou a validar.
 */
export function nextLoad(history, [low, high], exercise) {
  const last = history.at(-1)
  const top = last && topSet(last.sets)
  if (!top) return null
  if (last.pain) return { action: 'pain', weight_grams: top.weight_grams }
  if (!top.weight_grams) return { action: 'reps', weight_grams: 0 }
  const working = last.sets.filter(set => set.weight_grams === top.weight_grams)
  if (working.some(set => set.reps < low)) {
    const before = history.at(-2)
    const missedBefore = before && !before.pain && before.sets.some(set => set.weight_grams === top.weight_grams && set.reps < low)
    if (!missedBefore) return { action: 'hold', weight_grams: top.weight_grams }
    const step = loadStep(exercise)
    const lower = Math.max(0, Math.floor(top.weight_grams * 0.9 / step) * step)
    return { action: 'reduce', weight_grams: lower }
  }
  if (last.sets.every(set => set.weight_grams === top.weight_grams && set.reps >= high)) {
    const step = loadStep(exercise)
    const increase = Math.max(step, Math.ceil(top.weight_grams * 0.025 / step) * step)
    if (increase > top.weight_grams * 0.1) return { action: 'reps', weight_grams: top.weight_grams, reason: 'small_load' }
    return { action: 'increase', weight_grams: top.weight_grams + increase }
  }
  return { action: 'reps', weight_grams: top.weight_grams }
}

/** Faixa de repetições que o plano usa para o exercício (a do plano, se estiver nele; senão pela categoria). */
export const repRangeOf = exerciseId => REPS[EXERCISE_BY_ID[exerciseId]?.compound ? 'compound' : 'isolation']

/** Séries por semana de cada grupo muscular no plano (para mostrar e para os testes conferirem o alvo). */
export function weeklySetsByGroup(plan) {
  const totals = {}
  for (const day of plan.days) for (const item of day.exercises) totals[item.group] = (totals[item.group] ?? 0) + item.sets
  return totals
}

// Triagem de esforço antes de sugerir treino (guia do pacote de evidências, seção 1). Decisão do dono (15/11/2026): o
// plano sai mesmo com "sim", junto com o aviso para procurar um médico antes de começar. Texto a revisar pelo dono.
export const READINESS_QUESTIONS = {
  exertion_symptoms: 'Ao fazer esforço, você sente dor ou aperto no peito, tontura forte, desmaio ou falta de ar fora do comum?',
  medical_restriction: 'Algum médico já disse para você não fazer exercício ou só fazer com acompanhamento?',
  recent_injury: 'Você tem uma lesão recente ou uma dor que piora quando faz exercício?',
}

// Aviso fixo da tela (decisão do dono, 15/11/2026).
export const DISCLAIMER = 'Tudo aqui é sugestão com base em estudos científicos, não orientação profissional. Antes de começar, o ideal é passar por um médico; se sentir dor, pare.'
