# Behaviour Data Science no Focus Guide — design da fase 1

Estado: design da fase 1, 22 de outubro de 2026. As tasks 0 a 3 estão implementadas na branch `Behaviour-data`. Falta a task 4: a integração e a verificação manual das janelas no Electron (`npm run dev`). Nenhuma operação foi feita sobre dados pessoais e a instalação em `Aplicativo/` não foi substituída.

## 1. Objetivo

A pergunta (etapa *Ask*): **como melhorar a sessão de foco, diminuir os detratores e reconhecer os padrões de foco ao longo do dia e das atividades?**

A fase 1 dá ao app um ciclo completo de análise de dados:

1. **Coletar** alguns sinais novos, leves e locais.
2. **Processar** os registros com regras explícitas de limpeza e de qualidade.
3. **Analisar** com estatística e aprendizado de máquina interpretável.
4. **Compartilhar** os resultados em uma aba Insights, em sugestões no Focus e em uma ferramenta MCP só de leitura.

Sucesso significa: com os seus próprios registros, o app mostra quando você foca melhor, quanto tempo a sua atenção dura antes do primeiro desvio, o que mais atrapalha, e uma ou duas sugestões que você pode testar. Cada resultado mostra a evidência, a incerteza e os limites.

## 2. Decisões

**Decisões do usuário (22/10/2026):**

- Atividades relacionadas: o helper nativo **conta trocas de janela** em primeiro plano. Ele não guarda nomes de apps nem títulos de janelas.
- Sondas de atenção (*experience sampling*): **sim**, opcionais e desligadas por padrão.
- Escopo: **fase 1 completa**.
- Interface: **aba Insights dentro de Patterns**.

**Decisões do autor (podem ser revistas na aprovação):**

- A contagem de trocas de janela entra nesta entrega, e não na fase 3, porque é a resposta escolhida para "atividades relacionadas".
- Nada de deep learning na fase 1. Os dados são de uma pessoa (dezenas a centenas de sessões). Uma rede neural decoraria esses dados e não explicaria nada. Ela também traria uma dependência pesada. A fase 1 usa modelos clássicos com regularização e teste honesto.
- Nenhuma dependência nova. Os métodos numéricos são escritos em TypeScript em `src/shared/`.
- A interface continua em inglês, como o resto do app.
- Os cálculos são determinísticos: o gerador aleatório tem semente fixa. Os mesmos dados dão sempre o mesmo resultado.

## 3. Não objetivos e antiobjetivos

**Fora da fase 1:**

- Experimentos pessoais com sorteio da condição (fase 2).
- Modelos de sequência por minuto, como HMM ou GRU (fase 3, só com rótulos suficientes).
- Ritmo de digitação (intervalos entre teclas). O ritmo de digitação pode identificar uma pessoa, como uma biometria, e precisa de um Red Team próprio.

**Antiobjetivos.** A fase 1 falha, mesmo se funcionar tecnicamente, se ela:

- Criar uma "nota de atenção" ou de produtividade. O app mede foco **percebido** e eventos **declarados**.
- Afirmar causas. Associações aparecem como associações. Só a fase 2 (sorteio) permite falar de efeito.
- Transformar dado ausente em zero.
- Guardar qual tecla você apertou, coordenadas do mouse, nomes de apps, títulos de janelas ou conteúdo.
- Mostrar uma recomendação sem a evidência e o tamanho da amostra.
- Ler a base pessoal no preview.

## 4. O que já existe

- **Coleta passiva** (`src/main/behaviour.ts`, `native/activity-helper.cpp`): pacotes de cerca de 1 s com teclas, cliques, rolagens e movimento. O main process guarda esses pacotes em blocos de um minuto ativo, com estado `recorded`, `disabled` ou `unavailable`.
- **Coleta ativa**: "I'm back" (`attention-return` com `activeOffsetMs`), interrupção com categoria, pensamento estacionado, pausa, energia no início (1–5), foco percebido e nota no fim.
- **Análise**: `src/shared/analytics.ts` (Spearman com 20 pares em 7 dias) e `src/shared/behaviour-analytics.ts` (perfil descritivo por Goal, calculado no main process pelo comando `goal.behaviour`).
- **Limitação encontrada**: interrupções e pensamentos não guardam `activeOffsetMs`. A análise de duração da atenção precisa desse valor.

## 5. Coleta (Prepare)

### 5.1 Sinais passivos novos

| Sinal | Onde | Regra |
|---|---|---|
| `inputMs` por minuto | `behaviour.ts` | Soma da duração dos pacotes que tiveram alguma tecla, clique, rolagem ou movimento. Mede a densidade de interação sem depender da quantidade de teclas. O helper não muda para isso. |
| `switches` por minuto | helper nativo + `behaviour.ts` | Quantidade de trocas da **janela** em primeiro plano. Detalhes abaixo. |

Regras do helper para `switches`:

1. A cada tick de 1 s, e só durante a coleta, o helper lê `GetForegroundWindow()`. Depois, ele lê a janela raiz dona dessa janela com `GetAncestor(hwnd, GA_ROOTOWNER)`. Assim, uma caixa de diálogo conta como a janela que a abriu.
2. O helper ignora janelas do processo do Focus Guide. Ele compara o PID da janela (`GetWindowThreadProcessId()`) com o PID que ele já recebe na linha de comando. Assim, apertar "I'm back" na janela flutuante não conta como troca.
3. O helper conta uma troca quando a janela raiz muda em relação à última janela contada. A primeira janela depois do início não conta. A volta para a mesma janela depois de passar pelo Focus Guide não conta.
4. O helper guarda só o identificador da última janela, na memória. Ele nunca lê nomes de processos nem títulos.
5. Cada pacote ganha o campo `"switches":N`. A leitura uma vez por segundo ignora trocas mais curtas que ~1 s, como passar pelo Alt+Tab.
6. Trocar de aba dentro de um navegador não conta, porque a janela não muda. Trocar entre duas janelas do mesmo navegador conta.

Se o helper não mandar `switches` (por exemplo, um binário antigo em modo dev), o minuto fica com `switches = null`. O coletor **não** falha por isso, porque uma falha do coletor também desliga o atalho global do "I'm back".

### 5.2 Sinais ativos novos

**Reflexão no fim da sessão** (opcional, no mesmo modal de hoje e no editor do Calendar):

| Campo | Pergunta na interface | Valores |
|---|---|---|
| `detractor` | "What got in the way most?" | `none`, `notifications`, `people`, `thoughts`, `tiredness`, `task`, `other` |
| `challenge` | "How demanding was it?" | `too-easy`, `right`, `too-hard` |

Uma resposta ausente fica `null`. A pergunta de desafio permite comparar o foco com o equilíbrio entre desafio e habilidade (canal de *flow*).

**Sondas de atenção** (configuração `attentionProbes`, padrão `false`):

1. O main process agenda a primeira sonda entre 8 e 20 minutos ativos, em um ponto aleatório. As próximas vêm a cada 15 a 35 minutos ativos.
2. Nunca há sonda nos últimos 5 minutos de um timer em contagem regressiva. No cronômetro e no tempo extra (*overtime*), não há esse limite de fim. Cada sessão tem no máximo 6 sondas.
3. Sessões no modo `Offline` não têm sondas, porque você está longe da tela.
4. Quando a sonda começa, a janela principal mostra a pergunta "Where is your attention right now?" em uma faixa no topo, em qualquer página. A faixa tem três botões: **On the task**, **Drifting**, **Somewhere else**. A janela flutuante mostra os mesmos três botões, em tamanho pequeno.
5. Se a janela principal não está em foco, o main process mostra a janela flutuante **sem roubar o foco** (`showInactive`). Se a janela flutuante estava escondida, ela volta a ficar escondida quando a sonda termina.
6. A sonda expira em 45 s. Uma sonda expirada fica registrada como `missed`. Como a pergunta sempre aparece na tela, `missed` quer dizer "apareceu e ficou sem resposta". Não responder também é um dado.
7. Pausa, fim de sessão ou pausa curta (*break*) cancelam a sonda pendente sem registrar nada.

Cada resposta vira um evento `probe`:

- `category`: `on-task`, `drifting`, `elsewhere` ou `missed`.
- `activeOffsetMs`: o tempo ativo no momento em que a sonda apareceu.
- `source`: `floating`, `main` ou `null` (para `missed`).
- `text`: JSON `{"latencyMs": number | null}`, o tempo até a resposta.
- `durationMs`: 0.

A sonda também interrompe um pouco. As análises informam quantas sessões tiveram sondas.

### 5.3 Ajustes

- `interruption` e `thought` passam a guardar `activeOffsetMs`. O evento é salvo junto com o total durável da sessão, como o "I'm back" já faz. Para registros antigos, a análise calcula a posição com os intervalos `active` da sessão.
- `goal.behaviour` hoje recusa o filtro "All time" da seção Behaviour da Goal, porque o renderer manda `from = 2000-01-01` e o comando aceita no máximo 10 anos. `goal.behaviour` e o novo `insights.read` passam a aceitar qualquer intervalo válido com `from ≤ to`. O custo do cálculo depende da quantidade de sessões, e não da quantidade de dias.
- Novas sessões recebem `behaviourVersion = 4`.

## 6. Processamento (Process)

Todas as regras ficam em `src/shared/focus-insights.ts`. O relatório de qualidade mostra cada regra aplicada.

1. **Sessões que contam**: as mesmas de hoje (`selectedSessions`: concluídas, incluídas e dentro dos filtros).
2. **Valores extremos**: sessões com mais de 8 h ativas saem das análises (provável esquecimento de parar o timer). O relatório informa quantas saíram.
3. **Sessões recuperadas** (`recovered = true`) saem da duração da atenção e da curva dentro da sessão, porque o tempo delas pode estar cortado.
4. **Minutos de atividade**: só linhas `recorded` com `observedMs ≥ 30 000` entram nas features por minuto. As taxas usam só o tempo observado. Ausente nunca vira zero.
5. **Marcadores**: a posição de cada marcador é o `activeOffsetMs` ou, se for nulo, a posição calculada pelos intervalos ativos. Marcadores além de `activeMs` saem.
6. **Versões**: sessões com `behaviourVersion < 3` não tinham "I'm back" e saem da duração da atenção. `inputMs` e `switches` só existem a partir da versão 4.
7. **Hora local**: `parts(startedAt, timezone)`, como hoje. A hora entra nos modelos como seno e cosseno (hora circular: 23 h fica perto de 0 h).

**Features por sessão** (pré-sessão, usadas pelo modelo): hora (seno e cosseno), fim de semana, modo de atividade (*one-hot*, só modos com 5 ou mais sessões), duração planejada (ou cronômetro), energia (com indicador de ausente), número de sessões anteriores no dia, minutos de foco anteriores no dia, horas desde a sessão anterior (log, limite de 24 h) e vínculo com Goal.

**Features por sessão** (pós-sessão, só descritivas): taxa de marcadores de desvio por hora, `switches` por hora, fração de `inputMs`, fragmentação de estados, detrator e desafio.

**Features por minuto**: fração de `inputMs`, log(1 + teclas/min), log(1 + cliques/min), log(1 + rolagens/min), fração de movimento e `switches`/min.

## 7. Análise (Analyze)

**O que é um desvio.** Um desvio é um marcador que você mesmo inicia: `attention-return` ("I'm back") ou `interruption`. Essa regra vale para todas as seções e sugestões.

- Respostas de sonda **não** contam como desvio. As sondas seguem um calendário (nunca antes do minuto 8). Se elas contassem, a taxa de desvios subiria depois do minuto 8 só por causa do calendário, e a sugestão `break` mostraria um artefato.
- Pensamentos estacionados não contam como desvio. Eles são uma ferramenta para continuar na tarefa.
- As sondas têm uma medida própria: a **fração fora da tarefa** = (`drifting` + `elsewhere`) ÷ sondas respondidas. As sondas `missed` ficam fora dessa fração. O relatório de qualidade conta essas sondas à parte.

Cada seção tem um critério de elegibilidade. Quando o critério não é atingido, a seção mostra o motivo e o que falta, como o Patterns já faz.

| Seção | Método | Elegibilidade |
|---|---|---|
| **Ritmo do dia** | Foco percebido por hora de início, com suavização circular por kernel gaussiano (largura de 1,5 h) e intervalo de 90 %. Taxa de desvios, de trocas e fração fora da tarefa por hora. Grade de dia da semana × faixa de 6 h. | 10 sessões avaliadas. Uma hora aparece com peso efetivo ≥ 3. Uma célula da grade aparece com 3 sessões. |
| **Duração da atenção** | Curva de sobrevivência Kaplan–Meier do tempo ativo até o primeiro desvio. Uma sessão sem desvio é censurada no fim. Intervalo de Greenwood (log-log) e mediana com intervalo. Curvas por faixa horária e por modo. | 15 sessões com `behaviourVersion ≥ 3` e 8 desvios. Uma curva por grupo precisa de 8 sessões e 4 desvios. |
| **Curva dentro da sessão** | Fração de `inputMs`, trocas por minuto, taxa de desvios (desvios ÷ minutos de sessão em risco) e fração fora da tarefa em blocos de 5 minutos, até 120 minutos. | 10 sessões com atividade. Um bloco aparece com 5 sessões em risco. |
| **Estados de interação** | k-means++ nos minutos padronizados, só com as dimensões que nunca são nulas. `switches` aparece em cada estado só como descrição. O valor de k (2 a 5) é escolhido pela silhueta. Os estados ganham nomes por regra (ver 7.1). Fragmentação = trocas de estado por hora. Spearman entre fragmentação e foco. | 300 minutos qualificados de 5 sessões. Spearman com a regra atual (20 pares, 7 dias). |
| **Detratores** | Contagem dos detratores declarados e foco médio de cada um. Categorias de interrupção por hora. Trocas de janela por hora e Spearman com o foco. Foco por nível de desafio. | Uma média aparece com 3 sessões. Spearman com a regra atual. |
| **Modelo do foco** | Regressão ridge do foco percebido com as features pré-sessão. O λ é escolhido por validação *leave-one-out* (forma fechada). Teste temporal (*rolling origin*): o modelo treina com o passado e prevê a sessão seguinte, em até 40 pontos. A linha de base é a média do treino. Coeficientes com intervalo bootstrap de 90 % (200 reamostragens). | 30 sessões avaliadas em 14 dias e 10 pontos de teste. O modelo só aparece como útil se o erro médio absoluto (MAE) for pelo menos 5 % menor que o da linha de base. |

### 7.1 Nomes dos estados

1. Fração de `inputMs` menor que 0,15 → **Quiet**.
2. Nos outros, a maior dimensão padronizada do centróide dá o nome: teclas → **Typing**, rolagens → **Scrolling**, cliques → **Pointing and clicking**, movimento → **Moving the pointer**.
3. Nomes repetidos ganham `· light` e `· heavy`, pela fração de `inputMs`.

### 7.2 Sugestões

No máximo 5 sugestões, ordenadas pela força da evidência. Cada uma tem um título, um detalhe, a evidência (números e tamanho da amostra) e uma força: `tentative` ou `moderate`.

| Tipo | Quando aparece | Exemplo |
|---|---|---|
| `window` | Uma faixa com 5 sessões tem foco médio ≥ 0,3 acima do geral. É `moderate` se o intervalo não inclui a média geral. | "Your best-rated sessions start in the morning (06–12): 4.1 vs 3.6, 12 sessions." |
| `length` | A duração da atenção é elegível. A sugestão arredonda a mediana para 5 min, com mínimo de 15 min. | "Plan 25-minute blocks. Your median time before the first drift is 23 min (18–29)." |
| `break` | A taxa de desvios depois de um ponto é ≥ 1,5 × a dos primeiros 20 min. | "Drift rises after about 40 minutes. Try a short break there." |
| `detractor` | O detrator mais declarado tem 3 sessões e foco menor que `none`. O texto da intervenção vem de uma tabela fixa (por exemplo, `notifications` → modo não perturbe ou celular em outro cômodo; `thoughts` → "Park this thought"). | "Phone or notifications: 7 sessions, focus 2.9 vs 3.8." |
| `switching` | Spearman entre trocas e foco ≤ −0,3, elegível. | "Sessions with more window switching tend to have lower focus." |
| `challenge` | `too-hard` ou `too-easy` tem 3 sessões e foco menor que `right`. | "Hard sessions rate lower. Try a smaller first step." |
| `data` | A qualidade é baixa: menos de 60 % de sessões avaliadas, coleta desligada ou poucos marcadores. | "Rate more sessions to unlock the focus model." |

## 8. Compartilhamento (Share)

**Aba Insights em Patterns.** A página ganha duas abas abaixo da barra de filtros: **Overview** (a página de hoje) e **Insights**. Os filtros valem para as duas. Conteúdo da aba Insights:

1. Faixa de qualidade dos dados: sessões, % avaliadas, cobertura da coleta, uso de marcadores e sondas respondidas.
2. Fig. "When you focus best": curva por hora com faixa de intervalo, taxa de desvios e grade de dia da semana × faixa.
3. Fig. "How long until the first drift": curva em degraus, geral e por faixa ou modo, com a mediana.
4. Fig. "The shape of a session": densidade de interação e taxa de desvios por minuto da sessão.
5. Fig. "Interaction states": proporção dos estados por modo, legenda com a descrição de cada estado, fragmentação × foco.
6. Fig. "What got in the way": detratores com o foco médio, categorias de interrupção, trocas de janela, desafio × foco.
7. Cartão "What tends to go with higher focus": coeficientes do modelo com intervalo, só se o modelo for útil. Senão, o MAE do modelo e o da linha de base.
8. Cartão "Suggestions to try": cada sugestão tem um botão que leva o texto para "One thing to try next week" na aba Overview.
9. Nota de limites no fim.

No modo "Explore an example", o renderer calcula os insights com o conjunto de exemplo. Esse conjunto ganha atividade, marcadores, sondas, detratores e desafios sintéticos, com padrões plantados (por exemplo, manhãs melhores e mais desvios à noite). Ele também cresce até atender ao critério do modelo: cerca de 60 sessões em 30 dias (hoje são 36 sessões em 12 dias).

**Sugestões no Focus.** Quando não há sessão e a página está visível, o Focus pede `insights.read` dos últimos 90 dias para o Goal preparado (ou para a área). Ele mostra até duas dicas abaixo da duração: `length` (um clique aplica a duração) e `window`. O resultado fica em cache até uma sessão terminar.

**Ferramenta MCP `get_focus_insights`** (nível `read`): entrada opcional `from`, `to`, `goalId`, `fieldId`. O padrão são os últimos 90 dias. A resposta é o mesmo objeto da aba, com no máximo 60 pontos por curva.

**Reflexão, Calendar, Settings e janela flutuante**: as perguntas de detrator e desafio no modal e no editor de sessão. Um interruptor "Attention check-ins" em Settings, perto da coleta. A sonda na janela flutuante (três botões pequenos com rótulos acessíveis) e na faixa do topo da janela principal (`App.tsx`), em qualquer página.

## 9. Contrato de dados

Este contrato permite que os subagentes trabalhem em paralelo. O coordenador escreve o contrato antes de distribuir as tarefas.

### 9.1 `src/shared/types.ts`

```ts
export type EventKind = 'active' | 'pause' | 'interruption' | 'thought' | 'recovery' | 'edit' | 'attention-return' | 'probe';
export const DETRACTORS = ['none', 'notifications', 'people', 'thoughts', 'tiredness', 'task', 'other'] as const;
export type Detractor = typeof DETRACTORS[number];
export const CHALLENGES = ['too-easy', 'right', 'too-hard'] as const;
export type Challenge = typeof CHALLENGES[number];
export const PROBE_ANSWERS = ['on-task', 'drifting', 'elsewhere'] as const;
export type ProbeAnswer = typeof PROBE_ANSWERS[number];
// FocusSession ganha:   detractor?: Detractor | null; challenge?: Challenge | null;
// ActivitySample ganha: inputMs?: number | null; switches?: number | null;
// Settings ganha:       attentionProbes?: boolean;
/* Runtime only, like graphicsMode: never in settings, datasets or backups. */
export interface PendingProbe { id: string; sessionId: string; shownAt: string; expiresAt: string }
// AppState ganha:       probe?: PendingProbe | null;
// Command ganha:        'probe.answer' | 'insights.read'
// BackupFile:           schemaVersion: 10
```

Comandos:

- `probe.answer { id, answer: ProbeAnswer, source: 'floating' | 'main' }`. Recusa um `id` que não é a sonda pendente ("This check-in has expired.").
- `insights.read { from, to, fieldId?, goalId? }` → `FocusInsights`. Só leitura. Aceita qualquer intervalo válido com `from ≤ to`.
- `session.review` e `session.edit` aceitam `detractor` e `challenge` opcionais. Uma chave ausente mantém o valor salvo.

### 9.2 `src/shared/focus-insights.ts`

```ts
export interface Eligibility { eligible: boolean; n: number; reason: string }
export interface Interval { estimate: number; low: number; high: number } // 90 %
export interface DataQuality {
  sessions: number; activeMinutes: number; spanDays: number;
  ratedShare: number | null; reflectionShare: number | null;
  activityCoverage: number | null;   // tempo observado ÷ tempo ativo, sessões com behaviourVersion ≥ 3
  markerSessions: number; probeSessions: number; probeAnswered: number; probeMissed: number;
  droppedLong: number; droppedRecovered: number; notes: string[];
}
/* Drift = attention-return or interruption. Probe answers are measured only as offTaskShare. */
export interface HourPoint { hour: number; weight: number; focus: Interval | null; driftPerHour: number | null; switchesPerHour: number | null; offTaskShare: number | null }
export interface RhythmSection extends Eligibility {
  hours: HourPoint[];
  grid: Array<{ weekday: string; band: string; sessions: number; focusMean: number | null; driftPerHour: number | null }>;
}
export interface SurvivalCurve {
  label: string; sessions: number; events: number; median: Interval | null;
  points: Array<{ minute: number; survival: number; low: number; high: number; atRisk: number }>;
}
export interface AttentionSpanSection extends Eligibility { overall: SurvivalCurve | null; byBand: SurvivalCurve[]; byMode: SurvivalCurve[] }
export interface SessionShapeSection extends Eligibility {
  points: Array<{ minute: number; sessions: number; inputShare: number | null; switchesPerMinute: number | null; driftPerHour: number | null; offTaskShare: number | null }>;
}
export interface InteractionState {
  id: number; label: string; share: number;
  centroid: { inputShare: number; keysPerMinute: number; clicksPerMinute: number; scrollsPerMinute: number; movementShare: number; switchesPerMinute: number | null };
}
export interface StatesSection extends Eligibility {
  k: number; silhouette: number | null; states: InteractionState[];
  byMode: Array<{ mode: ActivityMode; minutes: number; shares: number[] }>;
  fragmentation: { perHourMedian: number | null; focusRho: number | null; pairs: number; reason: string };
}
export interface DetractorsSection extends Eligibility {
  reported: Array<{ detractor: Detractor; sessions: number; focusMean: number | null }>;
  interruptions: Array<{ category: string; count: number; perHour: number | null }>;
  byBand: Array<{ band: string; driftPerHour: number | null; switchesPerHour: number | null; offTaskShare: number | null }>;
  switching: { perHourMedian: number | null; focusRho: number | null; pairs: number; reason: string };
  challenge: Array<{ challenge: Challenge; sessions: number; focusMean: number | null }>;
}
export interface ModelFeature { name: string; label: string; effect: Interval } // efeito no foco por 1 desvio-padrão, ou contra a referência
export interface FocusModelSection extends Eligibility {
  useful: boolean; trainedOn: number; tested: number; lambda: number | null;
  mae: number | null; baselineMae: number | null; features: ModelFeature[];
}
export interface Recommendation {
  id: string; kind: 'window' | 'length' | 'break' | 'detractor' | 'switching' | 'challenge' | 'data';
  title: string; detail: string; evidence: string; strength: 'tentative' | 'moderate';
  minutes?: number; // só em 'length': a duração sugerida
}
export interface FocusInsights {
  from: string; to: string; computedAt: string; quality: DataQuality;
  rhythm: RhythmSection; attentionSpan: AttentionSpanSection; sessionShape: SessionShapeSection;
  states: StatesSection; detractors: DetractorsSection; model: FocusModelSection;
  recommendations: Recommendation[]; note: string;
}
export interface InsightOptions { from: string; to: string; fieldId?: string; goalId?: string; now?: number }
/* `activity` holds the samples of the selected sessions; other samples are ignored. Pure and deterministic. */
export function focusInsights(data: Dataset, activity: ActivitySample[], options: InsightOptions): FocusInsights;
```

Os métodos numéricos (estatística descritiva, RNG com semente, bootstrap, Kaplan–Meier, kernel circular, padronização, ridge com Cholesky, k-means++, silhueta) ficam em `src/shared/insight-stats.ts`. O Spearman e a mediana atuais de `analytics.ts` são reaproveitados.

## 10. Esquema 10 e backup 10

**SQLite (migração 9 → 10):**

1. `VACUUM INTO backups/before-schema-v10-<timestamp>.sqlite` antes de mudar qualquer coisa.
2. Uma transação:
   ```sql
   ALTER TABLE sessions ADD COLUMN detractor TEXT;
   ALTER TABLE sessions ADD COLUMN challenge TEXT;
   ALTER TABLE activity ADD COLUMN inputMs REAL;
   ALTER TABLE activity ADD COLUMN switches INTEGER;
   PRAGMA user_version = 10;
   ```
   e `attentionProbes: false` nas configurações salvas.
3. A verificação de versão máxima passa de 9 para 10.
4. `putSession` e `putActivity` passam a usar **lista explícita de colunas** em vez de `INSERT ... VALUES` por posição.
5. Os blocos de atividade continuam se unindo no mesmo minuto. `inputMs` e `switches` somam. Se um dos lados é `null`, o resultado é `null`.

**Valores nulos:** linhas antigas ficam com `inputMs` e `switches` nulos. Linhas com estado diferente de `recorded` também ficam com os dois nulos.

**Backup JSON 10:**

- Sessões ganham `detractor` e `challenge`. Atividade ganha `inputMs` (nulo ou entre 0 e `observedMs`) e `switches` (nulo ou inteiro entre 0 e 1000). Linhas que não são `recorded` não podem ter medidas.
- Eventos aceitam `probe`, com duração 0 e categoria válida.
- Um backup 9 é normalizado para 10 com valores nulos. As versões 1 a 9 continuam aceitas.
- O restore desliga `collectActivity`, `agentAccess` e também `attentionProbes`.
- O Focus Guide 2.0.0 não restaura um backup 10.
- Os CSVs ganham colunas: sessões (`detractor`, `challenge`) e atividade (`input_ms`, `window_switches`). O CSV de eventos já inclui `probe` pela coluna de tipo.

## 11. Invariantes mantidas

- Só o main process mede o tempo. O agendador de sondas usa o tempo ativo do `TimerEngine`. O renderer não decide nada sobre tempo.
- Um evento `probe` é salvo junto com o total durável da sessão, como o `attention-return`. Assim, a recuperação nunca deixa um marcador além do tempo salvo.
- `AppState.probe` é só de execução: nunca chega às configurações, aos datasets nem aos backups.
- O preview nunca lê a base pessoal. Ele usa o mesmo agendador, com intervalos curtos quando a URL tem `&probes=fast`.
- O agente continua só lendo no nível `read`.

## 12. Desempenho

`insights.read` roda no main process, como `goal.behaviour`. O timer não perde tempo (relógio monotônico), mas um cálculo longo trava a interface por um momento. Limites:

- k-means treina com no máximo 5 000 minutos, escolhidos por amostra determinística. A silhueta usa no máximo 1 500 pontos. Depois, todos os minutos recebem um estado.
- O teste temporal do modelo usa no máximo 40 pontos. O bootstrap usa 200 reamostragens.
- Meta: menos de 300 ms para 1 000 sessões e 60 000 minutos. A verificação mede esse tempo. Se a meta falhar, o cálculo vai para o renderer ou ganha cache.

## 13. Verificação

O repositório não aceita suítes de teste no workspace. As verificações automáticas rodam em scripts temporários na pasta de rascunho da sessão.

1. `npm.cmd run typecheck` e `npm.cmd run build` em `Arquivos/` (o build compila o helper).
2. **Motor de análise**: dados sintéticos com efeitos plantados. O script confere se cada método encontra o efeito: Kaplan–Meier contra um exemplo calculado à mão; ridge recupera os coeficientes; k-means separa grupos; os critérios de elegibilidade bloqueiam amostras pequenas; não há `NaN` nem `Infinity`; o tempo fica dentro da meta.
3. **Migração**: o script cria uma base sintética de esquema 9 com o código atual (HEAD) em uma pasta temporária e abre essa base com o código novo. Ele confere `user_version = 10`, o snapshot, a contagem de linhas, os valores preservados e `foreign_key_check` vazio. **Nunca** a base pessoal.
4. **Backup**: ida e volta de JSON 9 → 10 e 10 → 10. Recusa de valores inválidos.
5. **Helper**: compilar e rodar sozinho. A saída deve ter `switches`, e o atalho continua registrando.
6. **Preview** (`npm.cmd run preview`, `?preview=1`): aba Insights com o exemplo, modo claro e escuro, largura estreita, sonda com `&probes=fast`, reflexão com detrator e desafio, sugestão no Focus. Console sem erros.

## 14. Red Team

**Ação e escopo.** A migração do esquema 9 para o 10 roda na base pessoal quando você abrir o novo build pela primeira vez. A entrega também muda o formato de backup para a versão 10, muda o helper nativo (leitura da janela em primeiro plano, sem nome nem título) e cria sondas que mostram a janela flutuante. Durante o desenvolvimento, nenhum passo toca a base pessoal. A pasta `Aplicativo/` só muda se você pedir.

**O que pode dar errado:**

| Risco | Gatilho e consequência | Gravidade |
|---|---|---|
| `INSERT` por posição desalinhado | Uma base com colunas em ordem inesperada grava valores na coluna errada. | Alta (corrupção silenciosa). Correção: lista explícita de colunas. |
| Falha no meio da migração | Erro de disco ou de SQL. A transação desfaz tudo, e o snapshot `before-schema-v10` fica disponível. | Média. |
| Volta para o 2.0.0 | O app antigo recusa o esquema 10, e o 2.0.0 não restaura um backup 10. | Média. Recuperação: snapshot + build antigo. Os dados novos se perdem, a menos que você exporte antes. |
| Coletor rejeita a mensagem nova | `fail()` desliga a coleta **e o atalho global do "I'm back"**. | Alta para a experiência. Correção: `switches` opcional e teste com o binário real. |
| Sonda rouba o foco ou incomoda | A janela aparece sobre o trabalho. A própria sonda vira detrator (efeito da medição). | Média. Correção: desligada por padrão, `showInactive`, baixa frequência, nunca no fim, expira sozinha. As análises informam as sessões com sondas. |
| Resposta atrasada ou duplicada | A resposta chega depois da expiração ou duas vezes. | Baixa. Correção: o `id` tem que ser o da sonda pendente, e o registro limpa a pendência. |
| Conclusão falsa | Amostra pequena, muitas comparações e confusão: você escolhe o horário, então o horário não é sorteado. | Alta para a confiança no produto. Correção: critérios de elegibilidade, intervalos, teste fora da amostra, força `tentative`, notas de limite. |
| Main process travado | Um cálculo grande trava a interface. | Média. Correção: limites da seção 12 e medição. |
| Privacidade da janela | O helper lê o identificador da janela em primeiro plano e o PID dela. | Baixa. O helper não lê nomes nem títulos e guarda um número na memória. Precisa de documentação. |
| Exposição ao agente | A ferramenta MCP nova dá dados de comportamento derivados. | Baixa. Mesmo nível de sensibilidade de `get_goal_behaviour`, só com acesso `read` ligado por você. |

**Suposições e fragilidade:**

- As janelas do Electron pertencem ao processo principal, cujo PID o helper já recebe. Evidência: o Electron cria as janelas nativas no processo principal. A verificação 5 confirma esse ponto. Se essa suposição falhar, o clique no "I'm back" flutuante passa a contar como troca.
- O significado de `switches` fica fixo no momento da gravação. O helper não guarda dados brutos, então uma regra errada não pode ser corrigida depois para os dados já coletados.
- Os pacotes têm cerca de 1 s (`SetTimer` de 1000 ms no helper). A resolução de `inputMs` é então de cerca de 1 s.
- O volume dos seus dados é desconhecido. Os limites foram testados só com dados sintéticos.
- Os padrões plantados no exemplo servem para demonstração. Eles não validam o método nos seus dados.

**Alternativas mais seguras:**

- **Só análise, sem esquema novo**: cerca de 60 % do valor, sem risco de migração. Perde detrator, desafio, sondas e trocas de janela. Você escolheu a fase 1 completa.
- **Guardar a reflexão em eventos** em vez de colunas: evita mudar a tabela de sessões, mas o backup muda do mesmo jeito. O ganho é pequeno, e a consulta fica pior.
- **Não há alternativa mais segura para as trocas de janela** com o mesmo valor. A leitura uma vez por segundo, sem gancho do sistema, já é a forma menos invasiva.

**Monitoramento, volta e validação:**

- **Antes**: as verificações 1 a 5 da seção 13, sempre em pastas temporárias.
- **Sucesso**: a migração sintética preserva todas as linhas e valores; o backup faz a ida e volta; o helper emite `switches` e o atalho funciona; o typecheck e o build passam; o preview não mostra erros.
- **Condição de parada**: qualquer falha na verificação de migração ou de backup para a entrega até a correção.
- **Antes de instalar**: exporte um backup JSON no 2.0.0. Guarde a pasta `Aplicativo/` atual.
- **Volta**: feche o app, restaure o snapshot `before-schema-v10-*.sqlite` e use o build anterior. Os registros feitos depois da atualização só voltam por exportação.

**Recomendação:** prosseguir com as correções acima. As duas obrigatórias são a lista explícita de colunas e `switches` opcional no coletor.

## 15. Divisão do trabalho

O coordenador escreve o contrato (seção 9) e depois distribui as tarefas. Cada tarefa passa por um subagente revisor (conformidade com este documento e qualidade do código) antes da próxima etapa.

| Ordem | Tarefa | Arquivos | Depende de |
|---|---|---|---|
| 0 | Contrato | `types.ts`, esqueleto de `focus-insights.ts` | — |
| 1a | Persistência | `validation.ts`, `store.ts`, `backup.ts` | 0 |
| 1b | Motor de análise | `insight-stats.ts`, `focus-insights.ts`, `demo.ts` | 0 (em paralelo com 1a) |
| 2 | Execução | `activity-helper.cpp`, `behaviour.ts`, `timer.ts`, `probes.ts` (novo), `service.ts`, `index.ts`, `preview.ts` | 1a |
| 3a | Interface | `PatternsPage.tsx`, novo `InsightsPanel.tsx`, `App.tsx`, `FocusPage.tsx`, `CalendarPage.tsx`, `SettingsPage.tsx`, CSS | 1b, 2 |
| 3b | Agente e documentação | `agent-tools.ts`, `agent-service.ts`, `mcp/server.ts`, `Docs/*` | 1b, 2 (em paralelo com 3a) |
| 4 | Integração e verificação | seção 13 | todas |

### Entrega da task 2 — 22/10/2026

- Helper com contagem de trocas por janela raiz, exclusão das janelas do Focus Guide e reinício da referência a cada coleta. O coletor aceita helpers sem `switches`, preserva `null` e soma `inputMs` dentro do tempo durável.
- `ProbeScheduler` compartilhado pelo desktop e preview: agenda por tempo ativo, expira por relógio monotônico e limita a seis apresentações. Pausa, fim, pausa curta, desativação, Offline e uma transição que falhou (recuperação pendente) cancelam a sonda sem registro. Fechar ou esconder a janela flutuante também cancela a sonda pendente sem registro; a seção 5.2 não lista esse caso. Uma sonda só aparece com pelo menos 5 min 46 s restantes na contagem regressiva (45 s de expiração e 1 s de margem), para poder expirar antes dos últimos cinco minutos; depois disso, a próxima passa para `plannedMs + 15 min` (só acontece no tempo extra). Quando as sondas são ligadas no meio de uma sessão, a primeira vem de 8 a 20 minutos ativos depois.
- Apresentação mínima da pergunta na janela principal e na flutuante para permitir a verificação da execução. A flutuante usa `showInactive` e volta a ficar escondida quando foi aberta só pela sonda. O IPC deriva a origem da resposta da janela remetente.
- Gravação atômica de sondas, interrupções e pensamentos junto ao total ativo; novas sessões usam `behaviourVersion = 4`. Reflexões validam detrator/desafio, preservam chaves omitidas e permitem limpar respostas com `null`.
- `insights.read` retorna o motor existente somente com a atividade das sessões filtradas. Ele e `goal.behaviour` aceitam o intervalo All time. Preview sintético compartilha o agendador, aceita `&probes=fast` e agrega a atividade por minuto.
- Verificação em pastas de rascunho externas ao repositório: typecheck, `build:helper`, agendador com relógio falso, execução com `Store` temporário (marcadores, sondas, backup, reflexão, intervalos All time, coletor sem `switches`, tempo de `insights.read`) helper real e preview com `&probes=fast` (sonda mostrada, respondida e expirada como `missed`, console sem erros). As janelas do Electron (`showInactive`, volta da visibilidade, origem da resposta por IPC) ainda não foram verificadas.

O interruptor de Settings, os campos de reflexão na interface, a aba Insights, sugestões no Focus e a ferramenta MCP permanecem no escopo das tasks 3a/3b. Uma revisão independente aprovou a task 2 em 22/10/2026. O comportamento das janelas do Electron ainda precisa de uma verificação manual em `npm run dev`.

### Entrega das tasks 3a e 3b — 22/10/2026

**Task 3a (interface).**

- Patterns tem as abas **Overview** e **Insights**. A aba Insights mostra a faixa de qualidade dos dados, as cinco figuras, o cartão do modelo e as sugestões. Cada gráfico tem rótulo acessível. Os três gráficos de ritmo, duração da atenção e forma da sessão têm a tabela **Show values**. Um valor ausente fica como lacuna. Um limite aberto da mediana aparece como "or longer". O botão **Try next week** leva o texto da sugestão para o ajuste semanal.
- O modal do fim da sessão e o editor do Calendar fazem as duas perguntas de reflexão. As duas são opcionais e podem ser limpas.
- Settings tem o interruptor **Attention check-ins**.
- O Focus mostra até duas dicas dos últimos 90 dias: `length`, com o botão **Use N min**, e `window`.
- A sonda aparece em uma faixa abaixo da barra superior, em qualquer página, e como três botões pequenos na janela flutuante. A faixa não recebe o foco do teclado. Uma região ao vivo anuncia a sonda.

**Task 3b (agente e documentação).**

- A ferramenta MCP `get_focus_insights` (nível `read`) aceita `from`, `to`, `goalId` e `fieldId`. O padrão são os últimos 90 dias. Cada curva de sobrevivência tem no máximo 60 pontos: o primeiro, o último e pontos espaçados de modo uniforme.
- `ARCHITECTURE.md`, `DATA-DICTIONARY.md`, `USER-GUIDE.md`, `VISUAL-DESIGN.md`, `RELEASE-NOTES.md` e `CLAUDE.md` descrevem o recurso. Os limites e as regras do motor estão no `DATA-DICTIONARY.md`, com os valores reais de `INSIGHT_THRESHOLDS`.
- `insights.read` guarda os 4 últimos resultados em memória. A chave é a entrada validada mais `Store.revision()`, que lê `total_changes()` do SQLite. Qualquer escrita limpa o cache. A primeira chamada com 1 000 sessões leva cerca de 380 ms. Isso passa da meta de 300 ms da seção 12. O cache evita as chamadas repetidas, e a equipe aceitou o tempo.

**Onde o código difere do desenho (vale o código).**

- O λ do ridge vem do menor erro quadrático médio de *leave-one-out* (PRESS), em uma grade de 8 valores multiplicada pelo número de linhas de treino. A seção 7 fala em erro de *leave-one-out* sem dizer qual erro. Um empate fica com a penalidade mais forte.
- A sugestão `break` testa só pontos que têm sessões suficientes depois deles: pelo menos 5 sessões ainda em andamento 20 minutos depois do ponto. Ela também exige 8 desvios depois do ponto, escolhe o ponto de maior verossimilhança de Poisson e usa a força `moderate` só quando o limite de Bonferroni fica acima de 1.
- As sugestões `window`, `detractor` e `challenge` exigem uma diferença mínima de 0,3 ponto de foco (`focusGap`). A seção 7.2 pede apenas "foco menor" para `detractor` e `challenge`.
- Uma hora do ritmo do dia aparece quando a soma dos pesos do kernel chega a 3. A seção 7 fala em "peso efetivo".
- `SurvivalCurve.medianOpen` marca a mediana cujo limite superior nunca chega a 0,5. O limite superior é então aberto.
- As colunas de modo do modelo são escolhidas de novo em cada janela de treino. Um modo precisa de 5 sessões nessa janela. Modos mais raros entram na referência.
- Os intervalos do bootstrap são intervalos de percentil simples (5 % e 95 %). A estimativa pode ficar fora do intervalo.
- O cache das dicas do Focus muda quando uma sessão termina ou é apagada. Ele também muda quando mudam a nota de foco, a energia, as respostas de reflexão, a exclusão, a área ou a meta da sessão.
- O backup 10 aceita `inputMs` até `observedMs` mais 1 ms de tolerância, como as outras checagens de tempo.

A verificação manual das janelas do Electron (`showInactive`, a volta da janela flutuante ao estado escondido, a origem da resposta por IPC e a faixa da sonda) ainda precisa de `npm run dev`. Ela faz parte da task 4.

## 16. Decisões deixadas ao construtor

- O desenho exato dos gráficos, dentro de `Docs/VISUAL-DESIGN.md` e dos tokens de `tokens.css`.
- A forma de mostrar a sonda nos 132 × 156 px da janela flutuante, mantendo os rótulos acessíveis.
- O texto final das sugestões e das notas de limite, com o mesmo tom calmo do app.
- A divisão interna das funções em `focus-insights.ts` e `insight-stats.ts`.
